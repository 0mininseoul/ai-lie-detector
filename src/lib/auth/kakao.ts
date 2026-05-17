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
      redirectTo: redirectTo.toString()
    }
  });

  if (error) {
    throw error;
  }
}
