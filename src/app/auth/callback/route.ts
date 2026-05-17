import { NextResponse } from "next/server";
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
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      redirectUrl.searchParams.set("auth", "failed");
    } else {
      redirectUrl.searchParams.set("auth", "ok");
    }
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
