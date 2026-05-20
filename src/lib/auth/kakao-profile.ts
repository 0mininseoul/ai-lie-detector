import "server-only";

import { getSupabaseServer } from "@/lib/supabase/server";

type SyncArgs = {
  userId: string;
  providerToken: string | null | undefined;
};

type KakaoMeResponse = {
  id?: number;
  kakao_account?: {
    name?: string;
    has_gender?: boolean;
    gender_needs_agreement?: boolean;
    gender?: "male" | "female";
    has_birthyear?: boolean;
    birthyear_needs_agreement?: boolean;
    birthyear?: string;
    has_phone_number?: boolean;
    phone_number_needs_agreement?: boolean;
    phone_number?: string;
  };
};

type ProfileUpdate = {
  legal_name?: string;
  gender?: "male" | "female" | "other";
  birth_year?: number;
  phone_number?: string;
};

/**
 * 카카오 OAuth 콜백 직후 호출. session.provider_token으로 카카오 사용자 정보 API를
 * 쳐서 동의항목(이름·성별·출생연도·전화번호)을 profiles 테이블에 채운다.
 * 이미 값이 있는 컬럼은 덮어쓰지 않음 (재로그인 시 보존).
 */
export async function syncKakaoProfile({ userId, providerToken }: SyncArgs): Promise<void> {
  if (!providerToken) return;

  const response = await fetch("https://kapi.kakao.com/v2/user/me", {
    method: "GET",
    headers: { Authorization: `Bearer ${providerToken}` },
    cache: "no-store"
  });

  if (!response.ok) return;

  const data = (await response.json()) as KakaoMeResponse;
  const account = data.kakao_account ?? {};

  const incoming: ProfileUpdate = {};
  if (account.name) incoming.legal_name = account.name;
  if (account.gender === "male" || account.gender === "female") incoming.gender = account.gender;
  if (account.birthyear) {
    const year = Number.parseInt(account.birthyear, 10);
    if (Number.isFinite(year) && year >= 1900 && year <= 2100) {
      incoming.birth_year = year;
    }
  }
  if (account.phone_number) {
    incoming.phone_number = normalizeKoreanPhone(account.phone_number);
  }

  if (Object.keys(incoming).length === 0) return;

  const supabase = getSupabaseServer();

  const { data: existing } = await supabase
    .from("profiles")
    .select("legal_name, gender, birth_year, phone_number")
    .eq("id", userId)
    .maybeSingle();

  const updates: ProfileUpdate = {};
  if (incoming.legal_name && !existing?.legal_name) updates.legal_name = incoming.legal_name;
  if (incoming.gender && !existing?.gender) updates.gender = incoming.gender;
  if (incoming.birth_year && !existing?.birth_year) updates.birth_year = incoming.birth_year;
  if (incoming.phone_number && !existing?.phone_number) updates.phone_number = incoming.phone_number;

  if (Object.keys(updates).length === 0) return;

  await supabase.from("profiles").update(updates).eq("id", userId);
}

/**
 * 카카오는 "+82 10-1234-5678" 형태로 phone_number를 반환한다. 국내 표기로 정규화.
 */
function normalizeKoreanPhone(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("+82")) {
    const rest = trimmed.slice(3).trim();
    return ("0" + rest).replace(/\s+/g, "");
  }
  return trimmed.replace(/\s+/g, "");
}
