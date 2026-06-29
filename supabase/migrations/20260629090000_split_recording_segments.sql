create table if not exists recording_segments (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  segment text not null check (segment in ('warmup', 'target')),
  created_at timestamptz not null default now(),
  r2_key text not null,
  mime_type text not null,
  byte_size integer not null,
  duration_ms integer not null,
  expires_at timestamptz not null,
  unique (session_id, segment)
);

create unique index if not exists recording_segments_r2_key_idx on recording_segments (r2_key);
create index if not exists recording_segments_session_id_idx on recording_segments (session_id);
create index if not exists recording_segments_expires_at_idx on recording_segments (expires_at);

alter table recording_segments enable row level security;
revoke all on table recording_segments from anon, authenticated;
grant all on table recording_segments to service_role;

create or replace function complete_session_upload(
  p_session_id uuid,
  p_warmup_r2_key text,
  p_warmup_mime_type text,
  p_warmup_byte_size integer,
  p_warmup_duration_ms integer,
  p_target_r2_key text,
  p_target_mime_type text,
  p_target_byte_size integer,
  p_target_duration_ms integer,
  p_duration_ms integer,
  p_warmup_start_ms integer,
  p_warmup_end_ms integer,
  p_target_start_ms integer,
  p_target_end_ms integer,
  p_feature_payload jsonb,
  p_schema_version integer,
  p_expires_at timestamptz
)
returns sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  session_row sessions;
begin
  select * into session_row from sessions where id = p_session_id for update;

  if session_row.id is null then
    raise exception 'Session not found';
  end if;

  if session_row.status not in ('created', 'recording') then
    raise exception 'Session cannot accept upload in current status';
  end if;

  insert into recordings (
    session_id,
    r2_key,
    mime_type,
    byte_size,
    duration_ms,
    warmup_start_ms,
    warmup_end_ms,
    target_start_ms,
    target_end_ms,
    expires_at
  )
  values (
    p_session_id,
    p_target_r2_key,
    p_target_mime_type,
    p_target_byte_size,
    p_duration_ms,
    p_warmup_start_ms,
    p_warmup_end_ms,
    p_target_start_ms,
    p_target_end_ms,
    p_expires_at
  )
  on conflict (session_id) do update
  set
    r2_key = excluded.r2_key,
    mime_type = excluded.mime_type,
    byte_size = excluded.byte_size,
    duration_ms = excluded.duration_ms,
    warmup_start_ms = excluded.warmup_start_ms,
    warmup_end_ms = excluded.warmup_end_ms,
    target_start_ms = excluded.target_start_ms,
    target_end_ms = excluded.target_end_ms,
    expires_at = excluded.expires_at;

  insert into recording_segments (
    session_id,
    segment,
    r2_key,
    mime_type,
    byte_size,
    duration_ms,
    expires_at
  )
  values
    (
      p_session_id,
      'warmup',
      p_warmup_r2_key,
      p_warmup_mime_type,
      p_warmup_byte_size,
      p_warmup_duration_ms,
      p_expires_at
    ),
    (
      p_session_id,
      'target',
      p_target_r2_key,
      p_target_mime_type,
      p_target_byte_size,
      p_target_duration_ms,
      p_expires_at
    )
  on conflict (session_id, segment) do update
  set
    r2_key = excluded.r2_key,
    mime_type = excluded.mime_type,
    byte_size = excluded.byte_size,
    duration_ms = excluded.duration_ms,
    expires_at = excluded.expires_at;

  insert into feature_payloads (
    session_id,
    payload_json,
    schema_version
  )
  values (
    p_session_id,
    p_feature_payload,
    p_schema_version
  )
  on conflict (session_id) do update
  set
    payload_json = excluded.payload_json,
    schema_version = excluded.schema_version;

  update sessions
  set status = 'uploaded', updated_at = now()
  where id = p_session_id
  returning * into session_row;

  return session_row;
end;
$$;

revoke all on function complete_session_upload(
  uuid,
  text,
  text,
  integer,
  integer,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  jsonb,
  integer,
  timestamptz
) from public, anon, authenticated;
grant execute on function complete_session_upload(
  uuid,
  text,
  text,
  integer,
  integer,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  jsonb,
  integer,
  timestamptz
) to service_role;
