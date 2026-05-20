"use client";

import { createSupabaseBrowser } from "@/lib/supabase/browser";

export async function signInWithKakao(nextPath = "/") {
  if (typeof window === "undefined") {
    throw new Error("Kakao login must run in the browser");
  }

  const supabase = createSupabaseBrowser();
  const redirectTo = new URL("/auth/callback", window.location.origin);
  redirectTo.searchParams.set("next", nextPath);

  const { error } = await supabase.auth.signInWithOAuth({
    provider: "kakao",
    options: {
      redirectTo: redirectTo.toString(),
      // 카카오 디벨로퍼스 동의항목(2026-05-20 승인): 이름·성별·출생연도·전화번호.
      // profile_nickname/profile_image는 기본 동의지만 명시해두면 동의 화면에 정확히 노출됨.
      scopes: "profile_nickname profile_image name gender birthyear phone_number"
    }
  });

  if (error) {
    throw error;
  }
}
