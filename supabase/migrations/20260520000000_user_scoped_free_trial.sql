/*
 * User-scoped free trial.
 *
 * Until now free trials were tracked per-device on `entitlements.free_trials_used`.
 * Side effect: the same authenticated user got a fresh "1 free try" on every
 * device (PC + mobile), and admins who topped up `profiles.manual_credits`
 * still saw "무료 체험 1회를 이미 사용했습니다" on the second device because
 * the device row had already consumed its own free trial AND was not finding
 * a matching profile fallback in the expected order.
 *
 * Going forward:
 *   1. `profiles.free_trials_used` is the source of truth for authenticated users.
 *   2. Anonymous (no user_id) callers still fall back to device-scoped trial.
 *   3. Device-scoped `entitlements.free_trials_used` is left alone for now
 *      — it stays in the schema but is only consulted for anonymous callers.
 *      A later migration can drop it once we're confident no anonymous path
 *      remains.
 *
 * Order of resolution inside `consume_analysis_credit`:
 *   1a. authenticated → profile.free_trials_used < 1            → use it
 *   1b. anonymous     → entitlements.free_trials_used < 1       → use it
 *   2.  entitlements.credits > 0                                → decrement
 *   3.  authenticated → profile.manual_credits > 0              → decrement
 *
 * `refund_free_trial` mirrors this: refunds go to the user's profile when
 * the session belonged to an authenticated user, otherwise to the device row.
 */

alter table profiles
  add column if not exists free_trials_used integer not null default 0
    check (free_trials_used >= 0);

/*
 * Backfill: if a user has used their device free trial anywhere, mark the
 * profile-level trial as used too. We don't multi-count across devices —
 * the cap is 1, and any device row with > 0 means this user has consumed it.
 */
update profiles p
set free_trials_used = 1,
    updated_at = now()
from entitlements e
where e.user_id = p.id::text
  and e.free_trials_used > 0
  and p.free_trials_used = 0;

drop function if exists public.consume_analysis_credit(text, uuid);

create or replace function public.consume_analysis_credit(
  p_device_id text,
  p_user_id uuid default null
)
returns entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  ent entitlements;
  touched_profile profiles;
begin
  if length(trim(p_device_id)) < 8 or length(p_device_id) > 128 then
    raise exception 'Invalid device id';
  end if;

  -- Ensure an entitlements row exists for this device and link it to the
  -- user the first time we see this pair. We need the row to exist so that
  -- every return path can read a current entitlement snapshot.
  insert into entitlements (device_id, user_id)
  values (p_device_id, case when p_user_id is null then null else p_user_id::text end)
  on conflict (device_id) do update
  set user_id = coalesce(entitlements.user_id, excluded.user_id);

  -- Step 1a: authenticated user's profile-level free trial.
  if p_user_id is not null then
    update profiles
    set free_trials_used = free_trials_used + 1,
        updated_at = now()
    where id = p_user_id
      and free_trials_used < 1
      and is_blocked = false
    returning * into touched_profile;

    if touched_profile.id is not null then
      select * into ent from entitlements where device_id = p_device_id;
      return ent;
    end if;
  end if;

  -- Step 1b: anonymous caller — device-scoped trial (legacy path).
  if p_user_id is null then
    update entitlements
    set free_trials_used = free_trials_used + 1,
        updated_at = now()
    where device_id = p_device_id
      and free_trials_used < 1
    returning * into ent;

    if ent.id is not null then
      return ent;
    end if;
  end if;

  -- Step 2: device-scoped paid credits.
  update entitlements
  set credits = credits - 1,
      updated_at = now()
  where device_id = p_device_id
    and credits > 0
  returning * into ent;

  if ent.id is not null then
    return ent;
  end if;

  -- Step 3: profile.manual_credits (admin escape hatch).
  if p_user_id is not null then
    update profiles
    set manual_credits = manual_credits - 1,
        updated_at = now()
    where id = p_user_id
      and manual_credits > 0
      and is_blocked = false
    returning * into touched_profile;

    if touched_profile.id is not null then
      select * into ent from entitlements where device_id = p_device_id;
      return ent;
    end if;
  end if;

  raise exception 'No analysis credits available';
end;
$$;

revoke all on function public.consume_analysis_credit(text, uuid)
  from public, anon, authenticated;
grant execute on function public.consume_analysis_credit(text, uuid)
  to service_role;


drop function if exists public.refund_free_trial(uuid);

create or replace function public.refund_free_trial(p_session_id uuid)
returns entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row sessions;
  updated_row entitlements;
  touched_profile profiles;
  user_uuid uuid;
begin
  update sessions
  set refunded_at = now(), updated_at = now()
  where id = p_session_id
    and refunded_at is null
  returning * into session_row;

  if session_row.id is null then
    -- Already refunded (or no session): return current device entitlement.
    select * into session_row from sessions where id = p_session_id;
    if session_row.id is null then
      raise exception 'Session not found';
    end if;

    select * into updated_row
    from entitlements
    where device_id = session_row.creator_device_id;

    if updated_row.id is null then
      insert into entitlements (device_id)
      values (session_row.creator_device_id)
      returning * into updated_row;
    end if;

    return updated_row;
  end if;

  -- Ensure the device row exists so callers can read state.
  insert into entitlements (device_id)
  values (session_row.creator_device_id)
  on conflict (device_id) do nothing;

  -- Authenticated session: refund at the profile level when possible.
  if session_row.user_id is not null then
    begin
      user_uuid := session_row.user_id::uuid;
    exception when others then
      user_uuid := null;
    end;

    if user_uuid is not null then
      update profiles
      set free_trials_used = free_trials_used - 1,
          updated_at = now()
      where id = user_uuid
        and free_trials_used > 0
      returning * into touched_profile;

      if touched_profile.id is not null then
        select * into updated_row
        from entitlements
        where device_id = session_row.creator_device_id;
        return updated_row;
      end if;

      -- Profile trial already at zero — give them a manual credit instead.
      update profiles
      set manual_credits = manual_credits + 1,
          updated_at = now()
      where id = user_uuid
      returning * into touched_profile;

      if touched_profile.id is not null then
        select * into updated_row
        from entitlements
        where device_id = session_row.creator_device_id;
        return updated_row;
      end if;
    end if;
  end if;

  -- Anonymous fallback: device-scoped refund (legacy behaviour).
  update entitlements
  set
    free_trials_used = case
      when free_trials_used > 0 then free_trials_used - 1
      else free_trials_used
    end,
    credits = case
      when free_trials_used = 0 then credits + 1
      else credits
    end,
    updated_at = now()
  where device_id = session_row.creator_device_id
  returning * into updated_row;

  return updated_row;
end;
$$;

revoke all on function refund_free_trial(uuid) from public, anon, authenticated;
grant execute on function refund_free_trial(uuid) to service_role;
