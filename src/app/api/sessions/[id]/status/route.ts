import { NextResponse } from "next/server";
import { z } from "zod";
import { logAxiomEvent } from "@/lib/observability/axiom";
import {
  analysisTimeoutErrorCode,
  analysisTimeoutErrorDetail,
  isAnalysisStale
} from "@/lib/sessions/analysis-timeout";
import { resolveTargetPlaybackTiming } from "@/lib/sessions/playback-timing";
import {
  isUploadStale,
  uploadTimeoutErrorCode,
  uploadTimeoutErrorDetail
} from "@/lib/sessions/upload-timeout";
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
    .select("id, status, error_code, error_detail, error_at, updated_at")
    .eq("id", sessionId.data)
    .single();

  if (sessionError || !session) {
    console.error("[status] session not found", {
      sessionId: sessionId.data,
      error: sessionError?.message
    });
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  let effectiveSession = session;

  if (isAnalysisStale(session.status, session.updated_at)) {
    const staleDurationMs = Date.now() - Date.parse(session.updated_at);
    const { data: updatedSession, error: staleError } = await supabase
      .from("sessions")
      .update({
        status: "failed",
        error_code: analysisTimeoutErrorCode,
        error_detail: analysisTimeoutErrorDetail,
        error_at: new Date().toISOString()
      })
      .eq("id", sessionId.data)
      .eq("status", "analyzing")
      .select("id, status, error_code, error_detail, error_at, updated_at")
      .maybeSingle();

    if (staleError) {
      console.error("[status] failed to mark stale analysis", {
        sessionId: sessionId.data,
        error: staleError.message
      });
      await logAxiomEvent({
        event: "analysis_stale_update_failed",
        level: "error",
        source: "next_status_route",
        sessionId: sessionId.data,
        staleDurationMs,
        error: staleError.message
      });
    } else if (updatedSession) {
      effectiveSession = updatedSession;
      await logAxiomEvent({
        event: "analysis_marked_stale",
        level: "warn",
        source: "next_status_route",
        sessionId: sessionId.data,
        staleDurationMs,
        errorCode: analysisTimeoutErrorCode
      });
    }
  }

  if (isUploadStale(effectiveSession.status, effectiveSession.updated_at)) {
    const staleDurationMs = Date.now() - Date.parse(effectiveSession.updated_at);
    const { data: updatedSession, error: staleError } = await supabase
      .from("sessions")
      .update({
        status: "failed",
        error_code: uploadTimeoutErrorCode,
        error_detail: uploadTimeoutErrorDetail,
        error_at: new Date().toISOString()
      })
      .eq("id", sessionId.data)
      .in("status", ["created", "recording"])
      .select("id, status, error_code, error_detail, error_at, updated_at")
      .maybeSingle();

    if (staleError) {
      console.error("[status] failed to mark stale upload", {
        sessionId: sessionId.data,
        error: staleError.message
      });
      await logAxiomEvent({
        event: "upload_stale_update_failed",
        level: "error",
        source: "next_status_route",
        sessionId: sessionId.data,
        staleDurationMs,
        error: staleError.message
      });
    } else if (updatedSession) {
      effectiveSession = updatedSession;
      await logAxiomEvent({
        event: "upload_marked_stale",
        level: "warn",
        source: "next_status_route",
        sessionId: sessionId.data,
        staleDurationMs,
        errorCode: uploadTimeoutErrorCode
      });
    }
  }

  const [resultResponse, recordingResponse, targetSegmentResponse] = await Promise.all([
    supabase
      .from("analysis_results")
      .select("verdict, headline, roast_comment, public_json")
      .eq("session_id", sessionId.data)
      .maybeSingle(),
    supabase
      .from("recordings")
      .select("r2_key, target_start_ms, target_end_ms")
      .eq("session_id", sessionId.data)
      .maybeSingle<{ r2_key: string; target_start_ms: number; target_end_ms: number }>(),
    supabase
      .from("recording_segments")
      .select("r2_key, duration_ms")
      .eq("session_id", sessionId.data)
      .eq("segment", "target")
      .maybeSingle<{ r2_key: string; duration_ms: number }>()
  ]);

  const { data: result, error: resultError } = resultResponse;
  const { data: recording, error: recordingError } = recordingResponse;
  const { data: targetSegment, error: targetSegmentError } = targetSegmentResponse;

  if (resultError) {
    console.error("[status] failed to load result", {
      sessionId: sessionId.data,
      error: resultError.message
    });
    return NextResponse.json({ error: "Failed to load session result" }, { status: 500 });
  }

  if (recordingError) {
    console.error("[status] failed to load recording timing", {
      sessionId: sessionId.data,
      error: recordingError.message
    });
  }

  if (targetSegmentError) {
    console.error("[status] failed to load target segment timing", {
      sessionId: sessionId.data,
      error: targetSegmentError.message
    });
  }

  if (effectiveSession.status === "failed") {
    console.error("[status] session failed", {
      sessionId: effectiveSession.id,
      errorCode: effectiveSession.error_code,
      errorDetail: effectiveSession.error_detail,
      errorAt: effectiveSession.error_at
    });
    await logAxiomEvent({
      event: "session_status_failed",
      level: "error",
      source: "next_status_route",
      sessionId: effectiveSession.id,
      errorCode: effectiveSession.error_code,
      errorDetail: effectiveSession.error_detail,
      errorAt: effectiveSession.error_at
    });
  }

  return NextResponse.json({
    id: effectiveSession.id,
    status: effectiveSession.status,
    errorCode: effectiveSession.error_code ?? null,
    errorDetail: effectiveSession.error_detail ?? null,
    result: result
      ? {
          verdict: result.verdict,
          headline: result.headline,
          roastComment: result.roast_comment,
          public: result.public_json
        }
      : null,
    recording: resolveTargetPlaybackTiming({
      recording: recording ?? null,
      targetSegment: targetSegment ?? null
    })
  });
}
