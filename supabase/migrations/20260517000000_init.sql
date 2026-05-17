create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id text,
  kakao_user_id text,
  creator_device_id text not null,
  respondent_device_id text,
  status text not null default 'created' check (status in (
    'created',
    'recording',
    'uploaded',
    'analyzing',
    'complete',
    'failed',
    'expired'
  )),
  target_question text not null,
  warmup_question text not null default '오늘 하루 중 제일 기억나는 일 뭐야?',
  locale text not null default 'ko',
  source text not null default 'web'
);

create table recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  r2_key text not null,
  mime_type text not null,
  byte_size integer not null check (byte_size > 0),
  duration_ms integer not null check (duration_ms > 0),
  warmup_start_ms integer not null check (warmup_start_ms >= 0),
  warmup_end_ms integer not null check (warmup_end_ms > warmup_start_ms),
  target_start_ms integer not null check (target_start_ms >= 0),
  target_end_ms integer not null check (target_end_ms > target_start_ms),
  check (warmup_end_ms <= duration_ms),
  check (target_end_ms <= duration_ms),
  check (warmup_end_ms <= target_start_ms),
  expires_at timestamptz not null
);

create table feature_payloads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  payload_json jsonb not null,
  schema_version integer not null default 1 check (schema_version > 0)
);

create table analysis_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  verdict text not null check (verdict in ('truth', 'lie')),
  headline text not null check (headline in ('진실', '거짓')),
  roast_comment text not null,
  public_json jsonb not null,
  private_json jsonb not null,
  model_name text not null,
  prompt_version integer not null check (prompt_version > 0),
  expires_at timestamptz not null
);

create table entitlements (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  user_id text,
  kakao_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  free_trials_used integer not null default 0 check (free_trials_used >= 0),
  credits integer not null default 0 check (credits >= 0),
  source text not null default 'mvp'
);

create index sessions_creator_device_id_idx on sessions (creator_device_id);
create index sessions_respondent_device_id_idx on sessions (respondent_device_id);
create index sessions_user_id_idx on sessions (user_id);
create index sessions_kakao_user_id_idx on sessions (kakao_user_id);
create index sessions_status_created_at_idx on sessions (status, created_at desc);

create trigger sessions_set_updated_at
before update on sessions
for each row
execute function set_updated_at();

create unique index recordings_r2_key_idx on recordings (r2_key);
create unique index recordings_session_id_unique_idx on recordings (session_id);
create index recordings_session_id_idx on recordings (session_id);
create index recordings_expires_at_idx on recordings (expires_at);

create unique index feature_payloads_session_id_unique_idx on feature_payloads (session_id);
create index feature_payloads_session_id_idx on feature_payloads (session_id);

create unique index analysis_results_session_id_unique_idx on analysis_results (session_id);
create index analysis_results_session_id_idx on analysis_results (session_id);
create index analysis_results_expires_at_idx on analysis_results (expires_at);

create index entitlements_user_id_idx on entitlements (user_id);
create index entitlements_kakao_user_id_idx on entitlements (kakao_user_id);
create unique index entitlements_user_id_unique_idx on entitlements (user_id) where user_id is not null;
create unique index entitlements_kakao_user_id_unique_idx on entitlements (kakao_user_id) where kakao_user_id is not null;

create trigger entitlements_set_updated_at
before update on entitlements
for each row
execute function set_updated_at();

alter table sessions enable row level security;
alter table recordings enable row level security;
alter table feature_payloads enable row level security;
alter table analysis_results enable row level security;
alter table entitlements enable row level security;

revoke all on table sessions from anon, authenticated;
revoke all on table recordings from anon, authenticated;
revoke all on table feature_payloads from anon, authenticated;
revoke all on table analysis_results from anon, authenticated;
revoke all on table entitlements from anon, authenticated;
