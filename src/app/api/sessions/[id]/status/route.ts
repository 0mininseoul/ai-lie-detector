import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const sessionIdSchema = z.uuid();

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const sessionId = sessionIdSchema.safeParse(id);

  if (!sessionId.success) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId.data)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const { data: result, error: resultError } = await supabase
    .from("analysis_results")
    .select("verdict, headline, roast_comment, public_json")
    .eq("session_id", sessionId.data)
    .maybeSingle();

  if (resultError) {
    return NextResponse.json({ error: "Failed to load session result" }, { status: 500 });
  }

  return NextResponse.json({
    id: session.id,
    status: session.status,
    result: result
      ? {
          verdict: result.verdict,
          headline: result.headline,
          roastComment: result.roast_comment,
          public: result.public_json
        }
      : null
  });
}
