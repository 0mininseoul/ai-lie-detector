/*
 * 카카오 개인정보 동의항목 신청 승인 후(2026-05-20) 수집하는 4개 항목을
 * profiles 테이블에 저장하기 위한 컬럼 추가.
 *
 *  - legal_name   : 카카오 "이름" (필수 동의)
 *  - gender       : 카카오 "성별" (필수 동의)
 *  - birth_year   : 카카오 "출생 연도" (필수 동의)
 *  - phone_number : 카카오 "카카오계정(전화번호)" (필수 동의)
 *
 * 실제 채우기는 OAuth 콜백(/auth/callback)에서 카카오 사용자 정보 API를
 * 호출한 뒤 service_role 클라이언트로 upsert하는 방식. 트리거(handle_new_user)는
 * 닉네임·아바타·이메일만 다루도록 그대로 둔다 — Supabase가 raw_user_meta_data에
 * 정확히 어떤 키로 매핑하는지 일관되지 않기 때문.
 */
alter table profiles
  add column if not exists legal_name text,
  add column if not exists gender text,
  add column if not exists birth_year integer,
  add column if not exists phone_number text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_gender_check'
  ) then
    alter table profiles
      add constraint profiles_gender_check
      check (gender is null or gender in ('male', 'female', 'other'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_birth_year_check'
  ) then
    alter table profiles
      add constraint profiles_birth_year_check
      check (birth_year is null or birth_year between 1900 and 2100);
  end if;
end
$$;

comment on column profiles.legal_name is
  '카카오 동의항목 "이름" (필수). 결과 카드·결제 영수증 표기용.';
comment on column profiles.gender is
  '카카오 동의항목 "성별" (필수). male/female/other. AI 신호 기준값 보정.';
comment on column profiles.birth_year is
  '카카오 동의항목 "출생 연도" (필수). 만 14세 미만 차단·연령대 보정.';
comment on column profiles.phone_number is
  '카카오 동의항목 "카카오계정(전화번호)" (필수). 본인 확인·중요 알림 발송.';

create index if not exists profiles_phone_number_idx on profiles (phone_number)
  where phone_number is not null;

/*
 * RLS — 추가 컬럼은 user-writable이 아니다. 콜백 라우트가 service_role로
 * 채우고, 사용자는 select만 가능. 기존 update grant(display_name, avatar_url)는
 * 그대로 유지.
 */
