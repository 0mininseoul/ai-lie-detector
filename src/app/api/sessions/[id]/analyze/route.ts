import { NextResponse } from "next/server";
import { z } from "zod";
import { triggerAnalysis } from "@/lib/analysis/trigger";
import { getSupabaseServer } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

// The worker runs the Gemini analysis synchronously and we await it via
// triggerAnalysis, so this retry route must stay open for the full analysis.
export const maxDuration = 60;

const sessionIdSchema = z.uuid();

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const sessionId = sessionIdSchema.safeParse(id);

  if (!sessionId.success) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  const supabase = getSupabaseServer();
  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId.data)
    .single();

  if (error || !session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!["uploaded", "analyzing"].includes(session.status)) {
    return NextResponse.json({ error: "Session is not ready for analysis" }, { status: 409 });
  }

  if (session.status === "analyzing") {
    return NextResponse.json({ status: session.status, analysisQueued: true });
  }

  const trigger = await triggerAnalysis(sessionId.data);
  if (!trigger.queued) {
    return NextResponse.json(
      {
        error: trigger.error ?? "Failed to queue analysis",
        analysisQueued: false
      },
      { status: trigger.status === "disabled" ? 503 : 502 }
    );
  }

  return NextResponse.json({ status: "uploaded", analysisQueued: true });
}
