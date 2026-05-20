import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { getKakaoProviderId } from "@/lib/auth/provider";
import { consumeAnalysisCredit } from "@/lib/entitlements/service";
import { cleanupExpiredSessions } from "@/lib/sessions/cleanup";
import { getSupabaseAuthUser } from "@/lib/supabase/auth-server";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getWarmupQuestion, parseCreateSessionInput } from "@/lib/sessions/validation";

function badRequest(error: unknown) {
  const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Invalid request";

  return NextResponse.json({ error: message ?? "Invalid request" }, { status: 400 });
}

export async function POST(request: Request) {
  let input;

  try {
    input = parseCreateSessionInput(await request.json());
  } catch (error) {
    return badRequest(error);
  }

  const supabase = getSupabaseServer();
  const authUser = await getSupabaseAuthUser();

  /*
   * Expired-session cleanup is a maintenance chore — don't make the user wait
   * for it on the way into /s/[id]. Fire-and-forget so the response races on
   * the two RPCs that actually matter (consume credit + insert session).
   */
  void cleanupExpiredSessions(supabase);

  try {
    await consumeAnalysisCredit(input.creatorDeviceId, authUser?.id ?? null);
  } catch {
    return NextResponse.json(
      { error: "무료 체험 1회를 이미 사용했습니다. 결제 기능이 열리면 다시 가보겠습니다." },
      { status: 402 }
    );
  }

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      user_id: authUser?.id ?? null,
      kakao_user_id: getKakaoProviderId(authUser),
      creator_device_id: input.creatorDeviceId,
      target_question: input.targetQuestion,
      warmup_question: getWarmupQuestion(),
      locale: input.locale,
      status: "created",
      source: "web"
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }

  return NextResponse.json({
    id: data.id,
    url: `/s/${data.id}`
  });
}
