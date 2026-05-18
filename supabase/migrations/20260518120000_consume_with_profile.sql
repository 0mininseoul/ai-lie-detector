/*
 * Wire `profiles.manual_credits` into the credit consumption flow.
 *
 * Existing behaviour (now expanded):
 *   1. Device free trial (entitlements.free_trials_used < 1) → use it.
 *   2. Device paid credits (entitlements.credits > 0) → decrement.
 *
 * New step (when caller passes p_user_id):
 *   3. Profile manual credits (profiles.manual_credits > 0) → decrement.
 *      This makes admin grants from Supabase Studio actually consumable.
 */

-- Old single-arg signature gets replaced; drop it first so the new
-- overload with the optional p_user_id parameter is unambiguous.
drop function if exists public.consume_analysis_credit(text);

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
  consumed_profile profiles;
begin
  if length(trim(p_device_id)) < 8 or length(p_device_id) > 128 then
    raise exception 'Invalid device id';
  end if;

  -- Ensure an entitlements row exists for this device and remember the
  -- user_id link the first time we see it.
  insert into entitlements (device_id, user_id)
  values (p_device_id, case when p_user_id is null then null else p_user_id::text end)
  on conflict (device_id) do update
  set user_id = coalesce(entitlements.user_id, excluded.user_id);

  -- Step 1+2: free trial, then device credits.
  update entitlements
  set
    free_trials_used = case
      when free_trials_used < 1 then free_trials_used + 1
      else free_trials_used
    end,
    credits = case
      when free_trials_used >= 1 and credits > 0 then credits - 1
      else credits
    end,
    updated_at = now()
  where device_id = p_device_id
    and (free_trials_used < 1 or credits > 0)
  returning * into ent;

  if ent.id is not null then
    return ent;
  end if;

  -- Step 3: fall back to user-scoped profile.manual_credits.
  if p_user_id is not null then
    update profiles
    set
      manual_credits = manual_credits - 1,
      updated_at = now()
    where id = p_user_id
      and manual_credits > 0
      and is_blocked = false
    returning * into consumed_profile;

    if consumed_profile.id is not null then
      -- Re-read the entitlement row to surface the current device state.
      select * into ent from entitlements where device_id = p_device_id;
      return ent;
    end if;
  end if;

  raise exception 'No analysis credits available';
end;
$$;

revoke all on function public.consume_analysis_credit(text, uuid) from public, anon, authenticated;
grant execute on function public.consume_analysis_credit(text, uuid) to service_role;
