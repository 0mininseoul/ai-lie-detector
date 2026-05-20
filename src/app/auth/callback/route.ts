import { NextResponse } from "next/server";
import { syncKakaoProfile } from "@/lib/auth/kakao-profile";
import { createSupabaseAuthServer } from "@/lib/supabase/auth-server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = sanitizeNextPath(requestUrl.searchParams.get("next"));
  const redirectUrl = new URL(next, requestUrl.origin);

  if (!code) {
    redirectUrl.searchParams.set("auth", "missing_code");
    return NextResponse.redirect(redirectUrl);
  }

  try {
    const supabase = await createSupabaseAuthServer();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data.session) {
      redirectUrl.searchParams.set("auth", "failed");
      return NextResponse.redirect(redirectUrl);
    }

    // 카카오 동의항목(이름·성별·출생연도·전화번호)을 profiles에 비-블로킹으로 채움.
    // 실패해도 로그인 자체는 성공으로 간주 — 세션은 이미 수립됨.
    try {
      await syncKakaoProfile({
        userId: data.session.user.id,
        providerToken: data.session.provider_token
      });
    } catch (caught) {
      console.error("[auth/callback] kakao profile sync failed", caught);
    }

    redirectUrl.searchParams.set("auth", "ok");
  } catch {
    redirectUrl.searchParams.set("auth", "missing_env");
  }

  return NextResponse.redirect(redirectUrl);
}

function sanitizeNextPath(next: string | null) {
  if (!next?.startsWith("/") || next.startsWith("//")) {
    return "/";
  }

  return next;
}
