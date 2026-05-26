create or replace function cleanup_expired_sessions(
  p_now timestamptz default now(),
  p_limit integer default 250
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  with doomed as (
    select s.id
    from sessions s
    where
      s.created_at < p_now - interval '7 days'
      or exists (
        select 1
        from analysis_results ar
        where ar.session_id = s.id
          and ar.expires_at < p_now
      )
    order by s.created_at asc
    limit greatest(1, least(p_limit, 1000))
  ),
  deleted as (
    delete from sessions s
    using doomed d
    where s.id = d.id
    returning s.id
  )
  select count(*) into deleted_count from deleted;

  return deleted_count;
end;
$$;

revoke all on function cleanup_expired_sessions(timestamptz, integer) from public, anon, authenticated;
grant execute on function cleanup_expired_sessions(timestamptz, integer) to service_role;
