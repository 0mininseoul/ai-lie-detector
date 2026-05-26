import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
import { triggerAnalysis } from "@/lib/analysis/trigger";
import { logAxiomEvent } from "@/lib/observability/axiom";
import { getSupabaseServer } from "@/lib/supabase/server";
import { assertR2KeyMatchesSession, parseCompleteUploadInput } from "@/lib/sessions/validation";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const sessionIdSchema = z.uuid();
const recordingExpiresInMs = 7 * 24 * 60 * 60 * 1000;

function badRequest(error: unknown, sessionId?: string) {
  const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Invalid request";
  console.error("[complete-upload] bad request", {
    sessionId,
    issues: error instanceof ZodError ? error.issues : undefined,
    message
  });
  return NextResponse.json({ error: message ?? "Invalid request" }, { status: 400 });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const sessionId = sessionIdSchema.safeParse(id);

  if (!sessionId.success) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  let input;

  try {
    input = parseCompleteUploadInput(await request.json());
    assertR2KeyMatchesSession(input.r2Key, sessionId.data);
  } catch (error) {
    return badRequest(error, sessionId.data);
  }

  const supabase = getSupabaseServer();
  const expiresAt = new Date(Date.now() + recordingExpiresInMs).toISOString();
  const { data: session, error } = await supabase.rpc("complete_session_upload", {
    p_session_id: sessionId.data,
    p_r2_key: input.r2Key,
    p_mime_type: input.mimeType,
    p_byte_size: input.byteSize,
    p_duration_ms: input.durationMs,
    p_warmup_start_ms: input.warmupStartMs,
    p_warmup_end_ms: input.warmupEndMs,
    p_target_start_ms: input.targetStartMs,
    p_target_end_ms: input.targetEndMs,
    p_feature_payload: input.featurePayload,
    p_schema_version: input.featurePayload.version,
    p_expires_at: expiresAt
  });

  if (error) {
    const message = error.message.includes("Session not found") ? "Session not found" : "Failed to complete upload";
    const status = error.message.includes("Session not found") ? 404 : 500;
    console.error("[complete-upload] rpc error", {
      sessionId: sessionId.data,
      r2Key: input.r2Key,
      byteSize: input.byteSize,
      durationMs: input.durationMs,
      message: error.message,
      hint: error.hint,
      code: error.code
    });
    await logAxiomEvent({
      event: "complete_upload_rpc_failed",
      level: "error",
      source: "next_complete_upload_route",
      sessionId: sessionId.data,
      byteSize: input.byteSize,
      durationMs: input.durationMs,
      errorCode: error.code,
      error: error.message
    });
    return NextResponse.json({ error: message }, { status });
  }

  const trigger = await triggerAnalysis(sessionId.data);
  if (!trigger.queued) {
    console.error("[complete-upload] trigger failed", {
      sessionId: sessionId.data,
      status: trigger.status,
      error: trigger.error
    });
    await logAxiomEvent({
      event: "analysis_trigger_failed",
      level: "error",
      source: "next_complete_upload_route",
      sessionId: sessionId.data,
      byteSize: input.byteSize,
      durationMs: input.durationMs,
      triggerStatus: trigger.status,
      error: trigger.error
    });
    return NextResponse.json(
      {
        error: trigger.error ?? "Failed to queue analysis",
        analysisQueued: false
      },
      { status: trigger.status === "disabled" ? 503 : 502 }
    );
  }

  await logAxiomEvent({
    event: "session_upload_completed",
    level: "info",
    source: "next_complete_upload_route",
    sessionId: sessionId.data,
    byteSize: input.byteSize,
    durationMs: input.durationMs,
    mimeType: input.mimeType,
    analysisQueued: true
  });

  return NextResponse.json({
    id: session.id,
    status: session.status,
    analysisQueued: true
  });
}
