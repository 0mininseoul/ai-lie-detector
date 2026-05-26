-- supabase/migrations/20260526120000_day_pass_entitlements.sql
/*
 * Day-pass model.
 *
 * Adds a time-based "unlimited pass" alongside the existing credit/free-trial
 * model. While `entitlements.pass_expires_at > now()`, analysis is unlimited
 * and consume_analysis_credit decrements nothing.
 *
 * Passes are device-scoped for v1 (same scope the original credits used).
 * Free trials remain profile-scoped for authenticated users; that path is
 * only reached when no active pass exists.
 */

alter table entitlements
  add column if not exists pass_expires_at timestamptz;

create index if not exists entitlements_pass_expires_at_idx
  on entitlements (pass_expires_at)
  where pass_expires_at is not null;

-- Idempotency + audit log for pass grants (entitlement_events requires
-- credits > 0, so passes get their own log table).
create table if not exists entitlement_pass_grants (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  provider text not null,
  provider_event_id text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  source text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists entitlement_pass_grants_device_id_idx
  on entitlement_pass_grants (device_id);

alter table entitlement_pass_grants enable row level security;
revoke all on table entitlement_pass_grants from anon, authenticated;

-- Rewrite consume_analysis_credit: active pass short-circuits everything.
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

  insert into entitlements (device_id, user_id)
  values (p_device_id, case when p_user_id is null then null else p_user_id::text end)
  on conflict (device_id) do update
  set user_id = coalesce(entitlements.user_id, excluded.user_id);

  -- Step 0: active unlimited pass → consume nothing.
  select * into ent from entitlements where device_id = p_device_id;
  if ent.pass_expires_at is not null and ent.pass_expires_at > now() then
    return ent;
  end if;

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

-- Grant (or extend) a time-based pass, idempotent on (provider, event id).
create or replace function public.grant_entitlement_pass(
  p_device_id text,
  p_duration_seconds integer,
  p_source text,
  p_provider text,
  p_provider_event_id text
)
returns entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  ent entitlements;
  inserted_id uuid;
begin
  if length(trim(p_device_id)) < 8 or length(p_device_id) > 128 then
    raise exception 'Invalid device id';
  end if;

  if p_duration_seconds is null or p_duration_seconds <= 0 then
    raise exception 'Pass duration must be positive';
  end if;

  insert into entitlement_pass_grants
    (device_id, provider, provider_event_id, duration_seconds, source)
  values
    (p_device_id, p_provider, p_provider_event_id, p_duration_seconds, p_source)
  on conflict (provider, provider_event_id) do nothing
  returning id into inserted_id;

  insert into entitlements (device_id)
  values (p_device_id)
  on conflict (device_id) do nothing;

  -- Duplicate event → do not extend again; return current state.
  if inserted_id is null then
    select * into ent from entitlements where device_id = p_device_id;
    return ent;
  end if;

  update entitlements
  set pass_expires_at =
        greatest(coalesce(pass_expires_at, now()), now())
          + make_interval(secs => p_duration_seconds),
      source = p_source,
      updated_at = now()
  where device_id = p_device_id
  returning * into ent;

  return ent;
end;
$$;

revoke all on function public.grant_entitlement_pass(text, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.grant_entitlement_pass(text, integer, text, text, text)
  to service_role;
