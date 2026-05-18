/*
 * profiles
 *  ─ One row per authenticated user, mirroring auth.users.id.
 *  ─ Holds the Kakao OAuth metadata that the OAuth callback populates
 *    (kakao_user_id, display_name, avatar_url).
 *  ─ manual_credits / manual_credit_note / granted_by_admin_at / is_blocked are
 *    intentionally admin-only knobs. The product currently consumes credits
 *    from the device-scoped `entitlements` table; manual_credits gives us a
 *    user-scoped escape hatch we can grant from Supabase Studio without
 *    needing payment integration.
 */
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  email text,
  kakao_user_id text,
  display_name text,
  avatar_url text,
  manual_credits integer not null default 0 check (manual_credits >= 0),
  manual_credit_note text,
  granted_by_admin_at timestamptz,
  is_blocked boolean not null default false
);

create unique index profiles_kakao_user_id_unique_idx
  on profiles (kakao_user_id)
  where kakao_user_id is not null;

create index profiles_email_idx on profiles (email);
create index profiles_is_blocked_idx on profiles (is_blocked);

create trigger profiles_set_updated_at
before update on profiles
for each row
execute function set_updated_at();

/*
 * On every new sign-up, copy the relevant Kakao metadata into profiles.
 * Supabase OAuth puts the provider sub on `raw_user_meta_data->>'provider_id'`
 * (with `provider_id` also available on the identities row). For Kakao the
 * subject is numeric. We also gather a friendly display name from any of the
 * common Kakao metadata keys.
 */
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  resolved_name text := coalesce(
    meta ->> 'name',
    meta ->> 'full_name',
    meta ->> 'nickname',
    new.email
  );
  resolved_avatar text := coalesce(
    meta ->> 'avatar_url',
    meta ->> 'picture'
  );
  resolved_kakao_id text := coalesce(
    meta ->> 'provider_id',
    meta ->> 'sub'
  );
begin
  insert into public.profiles (
    id,
    email,
    kakao_user_id,
    display_name,
    avatar_url
  )
  values (
    new.id,
    new.email,
    resolved_kakao_id,
    resolved_name,
    resolved_avatar
  )
  on conflict (id) do update
  set
    email = excluded.email,
    kakao_user_id = coalesce(excluded.kakao_user_id, profiles.kakao_user_id),
    display_name = coalesce(excluded.display_name, profiles.display_name),
    avatar_url = coalesce(excluded.avatar_url, profiles.avatar_url),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
after update of email, raw_user_meta_data on auth.users
for each row
execute function public.handle_new_user();

/*
 * Backfill: any existing auth.users get a profile row immediately.
 */
insert into public.profiles (id, email, kakao_user_id, display_name, avatar_url)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data ->> 'provider_id', u.raw_user_meta_data ->> 'sub'),
  coalesce(
    u.raw_user_meta_data ->> 'name',
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'nickname',
    u.email
  ),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
from auth.users u
on conflict (id) do nothing;

/*
 * RLS — users can read and limit-update their own row. Admin-only columns
 * (manual_credits, manual_credit_note, granted_by_admin_at, is_blocked) are
 * intentionally NOT user-writable. Updates from the Supabase service role
 * bypass RLS and are how admin grants flow in.
 */
alter table profiles enable row level security;

revoke all on table profiles from anon, authenticated;
grant select on table profiles to authenticated;
grant update (display_name, avatar_url) on table profiles to authenticated;

create policy "profiles_select_own"
  on profiles
  for select
  to authenticated
  using (id = auth.uid());

create policy "profiles_update_own"
  on profiles
  for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

/*
 * Admin helper — grant N credits to a profile by Kakao user id or email.
 * Run from Supabase SQL editor with service-role privileges.
 *
 *   select grant_manual_credits('1234567890', 5, '친구 보상');
 */
create or replace function public.grant_manual_credits(
  p_kakao_user_id text,
  p_credits integer,
  p_note text default null
)
returns profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_row profiles;
begin
  if p_credits <= 0 then
    raise exception 'Credits must be positive';
  end if;

  update profiles
  set
    manual_credits = manual_credits + p_credits,
    manual_credit_note = coalesce(p_note, manual_credit_note),
    granted_by_admin_at = now(),
    updated_at = now()
  where kakao_user_id = p_kakao_user_id
  returning * into updated_row;

  if updated_row.id is null then
    raise exception 'No profile found for kakao_user_id %', p_kakao_user_id;
  end if;

  return updated_row;
end;
$$;

revoke all on function grant_manual_credits(text, integer, text) from public, anon, authenticated;
grant execute on function grant_manual_credits(text, integer, text) to service_role;
