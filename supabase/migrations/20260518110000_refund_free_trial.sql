/*
 * Refund a free trial when a session ends in an error state.
 *
 * Goal: when AI analysis / upload fails for system reasons, give the user
 * an additional free attempt and surface a "죄송합니다, 1회 더 드립니다"
 * popup in the UI.
 *
 * Idempotency: `sessions.refunded_at` records that a refund has been
 * granted for this session. Re-calling the function for the same session
 * id is a no-op and returns the existing entitlement row.
 *
 * Refund policy:
 *   - if `free_trials_used > 0`: decrement it back to 0 (user regains the
 *     free trial they used).
 *   - else: bump `credits + 1` so paid users also get an extra try.
 */

alter table sessions
  add column if not exists refunded_at timestamptz;

create index if not exists sessions_refunded_at_idx
  on sessions (refunded_at)
  where refunded_at is not null;

create or replace function public.refund_free_trial(p_session_id uuid)
returns entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row sessions;
  updated_row entitlements;
begin
  -- Atomically mark the session as refunded; bail if already refunded.
  update sessions
  set refunded_at = now(), updated_at = now()
  where id = p_session_id
    and refunded_at is null
  returning * into session_row;

  if session_row.id is null then
    -- Already refunded (or no session): return current entitlement row.
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

  -- First-time refund: upsert entitlement, then either give back the
  -- free trial or grant +1 credit.
  insert into entitlements (device_id)
  values (session_row.creator_device_id)
  on conflict (device_id) do nothing;

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
