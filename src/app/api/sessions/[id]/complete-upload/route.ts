import { NextResponse } from "next/server";
import { ZodError, z } from "zod";
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

async function badRequest(error: unknown, sessionId?: string) {
  const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Invalid request";
  console.error("[complete-upload] bad request", {
    sessionId,
    issues: error instanceof ZodError ? error.issues : undefined,
    message
  });
  await logAxiomEvent({
    event: "complete_upload_bad_request",
    level: "error",
    source: "next_complete_upload_route",
    sessionId,
    error: message
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
    assertR2KeyMatchesSession(input.recordings.warmup.r2Key, sessionId.data);
    assertR2KeyMatchesSession(input.recordings.target.r2Key, sessionId.data);
  } catch (error) {
    return badRequest(error, sessionId.data);
  }

  const supabase = getSupabaseServer();
  const expiresAt = new Date(Date.now() + recordingExpiresInMs).toISOString();
  const { data: session, error } = await supabase.rpc("complete_session_upload", {
    p_session_id: sessionId.data,
    p_warmup_r2_key: input.recordings.warmup.r2Key,
    p_warmup_mime_type: input.recordings.warmup.mimeType,
    p_warmup_byte_size: input.recordings.warmup.byteSize,
    p_warmup_duration_ms: input.recordings.warmup.durationMs,
    p_target_r2_key: input.recordings.target.r2Key,
    p_target_mime_type: input.recordings.target.mimeType,
    p_target_byte_size: input.recordings.target.byteSize,
    p_target_duration_ms: input.recordings.target.durationMs,
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
      warmupR2Key: input.recordings.warmup.r2Key,
      targetR2Key: input.recordings.target.r2Key,
      warmupByteSize: input.recordings.warmup.byteSize,
      targetByteSize: input.recordings.target.byteSize,
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
      warmupByteSize: input.recordings.warmup.byteSize,
      targetByteSize: input.recordings.target.byteSize,
      durationMs: input.durationMs,
      errorCode: error.code,
      error: error.message
    });
    return NextResponse.json({ error: message }, { status });
  }

  await logAxiomEvent({
    event: "session_upload_completed",
    level: "info",
    source: "next_complete_upload_route",
    sessionId: sessionId.data,
    warmupByteSize: input.recordings.warmup.byteSize,
    targetByteSize: input.recordings.target.byteSize,
    durationMs: input.durationMs,
    warmupMimeType: input.recordings.warmup.mimeType,
    targetMimeType: input.recordings.target.mimeType,
    analysisQueued: false
  });

  return NextResponse.json({
    id: session.id,
    status: session.status,
    analysisQueued: false
  });
}
