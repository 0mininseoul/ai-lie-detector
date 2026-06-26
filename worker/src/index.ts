import { createClient } from "@supabase/supabase-js";
import { normalizeGeminiVideoMimeType } from "../../src/lib/gemini/mime";
import { geminiResponseSchema, parseGeminiResult } from "../../src/lib/gemini/schema";
import { maxWorkerUploadByteSize, verifyWorkerUploadToken } from "../../src/lib/uploads/worker-token";
import { logAxiomEvent, type AxiomEvent } from "./observability";

type R2ObjectBody = {
  arrayBuffer(): Promise<ArrayBuffer>;
  body: ReadableStream;
};

type R2Bucket = {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null,
    options?: {
      httpMetadata?: {
        contentType?: string;
      };
    }
  ): Promise<unknown>;
};

type WorkerContext = {
  waitUntil(promise: Promise<unknown>): void;
};

type Env = {
  RECORDINGS: R2Bucket;
  GOOGLE_CLOUD_PROJECT: string;
  GOOGLE_CLOUD_LOCATION?: string;
  GOOGLE_GENAI_USE_VERTEXAI?: string;
  VERTEX_AI_MODEL?: string;
  VERTEX_AI_GCS_BUCKET?: string;
  GOOGLE_SERVICE_ACCOUNT_KEY_BASE64: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  WORKER_SHARED_SECRET?: string;
  AXIOM_TOKEN?: string;
  AXIOM_DATASET?: string;
  AXIOM_URL?: string;
  AXIOM_INGEST_URL?: string;
  AXIOM_ORG_ID?: string;
};

type SessionRow = {
  id: string;
  status: string;
  target_question: string;
  warmup_question: string;
};

type RecordingRow = {
  r2_key: string;
  mime_type: string;
  byte_size: number;
  duration_ms: number;
  warmup_start_ms: number;
  warmup_end_ms: number;
  target_start_ms: number;
  target_end_ms: number;
};

type FeaturePayloadRow = {
  payload_json: unknown;
  schema_version: number;
};

type VertexVideoPart = {
  videoMetadata: {
    startOffset: string;
    endOffset: string;
    fps: number;
  };
} & (
  | {
      inlineData: {
        data: string;
        mimeType: string;
      };
    }
  | {
      fileData: {
        fileUri: string;
        mimeType: string;
      };
    }
);

type VertexVideoPartResult = {
  part: VertexVideoPart;
  source: "inline" | "gcs";
  gcsObjectName?: string;
};

type VertexGenerateResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
};

type ServiceAccountKey = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type CachedAccessToken = {
  serviceAccountEmail: string;
  accessToken: string;
  expiresAtMs: number;
};

const defaultVertexModel = "gemini-2.5-flash";
const workerVersion = "2026-05-27-analysis-logging-v1";
const promptVersion = 1;
const resultExpiresInMs = 7 * 24 * 60 * 60 * 1000;
const inlineVideoMaxBytes = 8 * 1024 * 1024;
// The worker now runs analysis synchronously inside the trigger request, so
// its total budget must stay under the caller's Vercel maxDuration (60s). The
// inline path (videos ≤ 8MB, the common case) is generate-only ≈ 52s worst
// case, leaving headroom. The rare file-upload path (> 8MB) can exceed 60s; if
// you move the Vercel route to a Pro plan you can raise both budgets together.
const geminiGenerateTimeoutMs = 50_000;
const heartbeatIntervalMs = 10_000;
const googleCloudPlatformScope = "https://www.googleapis.com/auth/cloud-platform";
const defaultGoogleTokenUri = "https://oauth2.googleapis.com/token";
let cachedAccessToken: CachedAccessToken | undefined;

const systemPrompt = `
당신은 "AI 거짓말탐지기"의 멀티모달 분석 모델입니다.

출력은 반드시 단일 JSON 객체입니다. Markdown, 설명문, 접두사, 접미사를 붙이지 마세요.

절대 규칙:
- 공개 결과 headline은 반드시 "진실" 또는 "거짓" 중 하나만 출력합니다.
- 공개 결과 headline에 다른 단어, 숫자, 확률, 문장부호를 붙이지 않습니다.
- 공개 결과에는 가능성, 확률, confidence, 내부 점수를 쓰지 않습니다.
- 공개 결과에는 감지 신호를 쓰지 않습니다.
- 공개 결과에는 어떤 행동, 표정, 시선, 음성, 답변 패턴이 수상했는지 쓰지 않습니다.
- 질문은 공개 결과와 공유 문구에 포함합니다.
- roast_comment는 심하게 놀리되 심한 욕설은 쓰지 않습니다.
- 일반적인 모바일 흔들림, 낮은 음량, 약한 조명, 짧은 5초 답변은 실패 사유가 아닙니다. 이런 경우에도 quality_gate.status는 "pass"로 두고 private_diagnostics.internal_confidence만 low로 낮춥니다.
- quality_gate.status="retry"는 영상 파일이 깨졌거나 얼굴과 답변을 모두 전혀 확인할 수 없는 경우에만 사용합니다.

공개 문구 톤:
- 한국어 인터넷식 유머와 강한 조롱 톤을 씁니다.
- 심한 욕설은 쓰지 않습니다.
- 결과는 짧고 세게 씁니다.
- A가 입력한 실제 질문 문장은 반말일 수 있지만, 서비스 UI와 안내 문구는 존댓말을 기준으로 합니다.
- roast_comment는 결과 근거를 직접 말하지 않습니다.

결과가 애매할 때:
- 공개 결과는 그래도 "진실" 또는 "거짓" 중 하나로 결정합니다.
- private_diagnostics.internal_confidence에 low/medium/high를 기록합니다.
- 공개 문구에는 애매함이나 확률을 드러내지 않습니다.
`.trim();

export default {
  async fetch(request: Request, env: Env, context: WorkerContext) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/health") {
      return Response.json({ ok: true, workerVersion });
    }

    if (url.pathname === "/upload") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: uploadCorsHeaders(request) });
      }

      if (request.method === "PUT") {
        return handleUpload(request, env, url, context);
      }
    }

    if (url.pathname.startsWith("/recording/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: downloadCorsHeaders(request) });
      }
      if (request.method === "GET") {
        return handleRecordingDownload(request, env, url);
      }
    }

    if (url.pathname.startsWith("/share-image/")) {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: downloadCorsHeaders(request) });
      }
      if (request.method === "GET" || request.method === "HEAD") {
        return handleShareImageDownload(request, env, url, request.method === "HEAD");
      }
    }

    if (request.method !== "POST" || url.pathname !== "/analyze") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    if (!isAuthorized(request, env)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let sessionId: string;
    try {
      const body = (await request.json()) as { sessionId?: unknown };
      if (typeof body.sessionId !== "string" || !isUuid(body.sessionId)) {
        return Response.json({ error: "Invalid sessionId" }, { status: 400 });
      }
      sessionId = body.sessionId;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    console.log("[analyze] received", JSON.stringify({ sessionId, workerVersion }));
    recordWorkerEvent(context, env, {
      event: "analysis_queued",
      level: "info",
      source: "worker_analyze_route",
      sessionId,
      workerVersion
    });

    // Run the analysis synchronously within this request. The caller (the
    // Next.js trigger route) holds the connection open until we finish, so
    // Cloudflare keeps the worker alive the whole time. A detached
    // context.waitUntil() task is evicted mid-Gemini-call — that was the silent
    // ~33% failure that the status route later swept as analysis_timeout.
    // The result is written to the DB regardless; the result page polls for it.
    try {
      await analyzeSession(sessionId, env, context);
      return Response.json({ status: "complete", sessionId });
    } catch (error) {
      await markSessionFailed(sessionId, env, error, context);
      // 200 so the trigger doesn't read this as a *trigger* failure — the
      // session is already marked failed and surfaced via status polling.
      return Response.json({ status: "failed", sessionId });
    }
  }
};

async function handleUpload(request: Request, env: Env, url: URL, context: WorkerContext) {
  const corsHeaders = uploadCorsHeaders(request);
  const token = url.searchParams.get("token");
  const logUploadFailure = (reason: string, fields: Record<string, unknown> = {}) => {
    recordWorkerEvent(context, env, {
      event: "worker_upload_failed",
      level: "error",
      source: "worker_upload_route",
      reason,
      ...fields
    });
  };

  if (!env.WORKER_SHARED_SECRET) {
    logUploadFailure("worker_secret_missing");
    return Response.json({ error: "Upload is not configured" }, { status: 503, headers: corsHeaders });
  }

  const verification = await verifyWorkerUploadToken(token, env.WORKER_SHARED_SECRET);
  if (!verification.valid) {
    logUploadFailure("token_invalid", { error: verification.error });
    return Response.json({ error: verification.error }, { status: 401, headers: corsHeaders });
  }

  const { payload } = verification;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType !== payload.mimeType) {
    logUploadFailure("content_type_mismatch", {
      sessionId: payload.sessionId,
      expectedMimeType: payload.mimeType,
      actualMimeType: contentType
    });
    return Response.json({ error: "Upload content type mismatch" }, { status: 400, headers: corsHeaders });
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = Number(contentLengthHeader);
  if (!contentLengthHeader || !Number.isFinite(contentLength) || contentLength <= 0) {
    logUploadFailure("content_length_missing", { sessionId: payload.sessionId });
    return Response.json({ error: "Upload content length is required" }, { status: 411, headers: corsHeaders });
  }

  if (payload.byteSize > maxWorkerUploadByteSize || contentLength > payload.byteSize) {
    logUploadFailure("body_too_large", {
      sessionId: payload.sessionId,
      expectedByteSize: payload.byteSize,
      contentLength
    });
    return Response.json({ error: "Upload body is larger than expected" }, { status: 413, headers: corsHeaders });
  }

  if (!request.body) {
    logUploadFailure("body_missing", { sessionId: payload.sessionId });
    return Response.json({ error: "Upload body is required" }, { status: 400, headers: corsHeaders });
  }

  try {
    await env.RECORDINGS.put(payload.r2Key, request.body, {
      httpMetadata: {
        contentType: payload.mimeType
      }
    });
  } catch (error) {
    logUploadFailure("r2_put_failed", {
      sessionId: payload.sessionId,
      error: error instanceof Error ? error.message : String(error)
    });
    return Response.json({ error: "Upload storage failed" }, { status: 500, headers: corsHeaders });
  }

  recordWorkerEvent(context, env, {
    event: "worker_upload_completed",
    level: "info",
    source: "worker_upload_route",
    sessionId: payload.sessionId,
    byteSize: payload.byteSize,
    mimeType: payload.mimeType
  });

  return Response.json({ ok: true, r2Key: payload.r2Key }, { headers: corsHeaders });
}

async function handleRecordingDownload(request: Request, env: Env, url: URL) {
  const corsHeaders = downloadCorsHeaders(request);
  const sessionId = url.pathname.slice("/recording/".length);
  if (!isUuid(sessionId)) {
    return Response.json({ error: "Invalid session id" }, { status: 400, headers: corsHeaders });
  }

  const supabase = createSupabase(env);
  const { data: recording, error } = await supabase
    .from("recordings")
    .select("r2_key, mime_type")
    .eq("session_id", sessionId)
    .maybeSingle<{ r2_key: string; mime_type: string }>();

  if (error || !recording) {
    return Response.json({ error: "Recording not ready" }, { status: 404, headers: corsHeaders });
  }

  const object = await env.RECORDINGS.get(recording.r2_key);
  if (!object) {
    return Response.json({ error: "R2 object missing" }, { status: 404, headers: corsHeaders });
  }

  const headers = new Headers(corsHeaders);
  headers.set("content-type", recording.mime_type);
  headers.set("cache-control", "private, max-age=3600");
  return new Response(object.body, { headers });
}

async function handleShareImageDownload(request: Request, env: Env, url: URL, headOnly = false) {
  const corsHeaders = downloadCorsHeaders(request);
  const sessionId = url.pathname.slice("/share-image/".length);
  if (!isUuid(sessionId)) {
    return Response.json({ error: "Invalid session id" }, { status: 400, headers: corsHeaders });
  }

  const object = await env.RECORDINGS.get(buildShareImageObjectKey(sessionId));
  if (!object) {
    const headers = new Headers(corsHeaders);
    headers.set("content-type", "image/svg+xml; charset=utf-8");
    headers.set("cache-control", "no-store");
    return new Response(headOnly ? null : buildFallbackShareImageSvg(), { headers });
  }

  const headers = new Headers(corsHeaders);
  headers.set("content-type", "image/jpeg");
  headers.set("cache-control", "public, max-age=86400, s-maxage=86400");
  return new Response(headOnly ? null : object.body, { headers });
}

function buildShareImageObjectKey(sessionId: string) {
  return `share-images/${sessionId}/preview-20260526-centered-question.jpg`;
}

function buildFallbackShareImageSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1440" viewBox="0 0 1080 1440">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#06120c"/>
      <stop offset="1" stop-color="#03070c"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1440" fill="url(#bg)"/>
</svg>`;
}

function downloadCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const headers = new Headers({
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "300"
  });
  if (isAllowedUploadOrigin(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  return headers;
}

async function analyzeSession(sessionId: string, env: Env, context: WorkerContext) {
  const startedAt = Date.now();
  const logStage = (stage: string, fields: Record<string, unknown> = {}) => {
    const elapsedMs = Date.now() - startedAt;
    // Mirror every stage to the Cloudflare console so `wrangler tail` and the
    // Workers dashboard show the live analysis progress, not just Axiom.
    console.log("[analyze]", stage, JSON.stringify({ sessionId, elapsedMs, ...fields }));
    recordWorkerEvent(context, env, {
      event: "analysis_stage",
      level: "info",
      source: "worker_analyze_session",
      sessionId,
      workerVersion,
      stage,
      elapsedMs,
      ...fields
    });
  };

  logStage("started");

  const supabase = createSupabase(env);
  const vertexConfig = getVertexConfig(env);

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, status, target_question, warmup_question")
    .eq("id", sessionId)
    .single<SessionRow>();

  if (sessionError || !session) {
    throw new Error("Session not found");
  }

  logStage("session_loaded", { status: session.status });

  if (session.status === "complete" || session.status === "analyzing") {
    logStage("skipped", { status: session.status });
    return;
  }

  if (session.status !== "uploaded") {
    throw new Error(`Session cannot be analyzed from status ${session.status}`);
  }

  const claimedSession = await requireNoSupabaseError(
    supabase.rpc("claim_session_for_analysis", { p_session_id: sessionId }),
    "Failed to claim session for analysis"
  );

  if (!claimedSession) {
    logStage("claim_skipped");
    return;
  }

  logStage("claimed");

  const [recordingResult, featurePayloadResult] = await Promise.all([
    supabase
      .from("recordings")
      .select(
        "r2_key, mime_type, byte_size, duration_ms, warmup_start_ms, warmup_end_ms, target_start_ms, target_end_ms"
      )
      .eq("session_id", sessionId)
      .single<RecordingRow>(),
    supabase
      .from("feature_payloads")
      .select("payload_json, schema_version")
      .eq("session_id", sessionId)
      .maybeSingle<FeaturePayloadRow>()
  ]);

  if (recordingResult.error || !recordingResult.data) {
    throw new Error("Recording not found");
  }

  if (featurePayloadResult.error) {
    throw new Error("Feature payload not found");
  }

  const recording = recordingResult.data;
  logStage("recording_loaded", {
    byteSize: recording.byte_size,
    durationMs: recording.duration_ms,
    mimeType: recording.mime_type
  });

  const r2Object = await env.RECORDINGS.get(recording.r2_key);
  if (!r2Object) {
    throw new Error("R2 recording object not found");
  }

  const videoBytes = await r2Object.arrayBuffer();
  logStage("r2_downloaded", { byteSize: videoBytes.byteLength });

  const videoPartResult = await buildGeminiVideoPart({
    env,
    vertexConfig,
    sessionId,
    recording,
    videoBytes,
    logStage
  });

  logStage("vertex_generate_started", { modelName: vertexConfig.model, videoSource: videoPartResult.source });

  // The generateContent call is the longest, riskiest leg (the silent-death
  // zone in past failures). Emit a heartbeat every ~10s so the runtime logs
  // show whether the worker is still alive and how far it gets — a missing
  // heartbeat pinpoints where execution stopped.
  const heartbeat = startHeartbeat(context, env, sessionId, startedAt, "vertex_generate");
  let responseText: string;
  try {
    responseText = await withTimeout(
      generateVertexContent(env, vertexConfig, {
        contents: [
          {
            role: "user",
            parts: [
              videoPartResult.part,
              {
                text: buildTextPayload({
                  session,
                  recording,
                  featurePayload: featurePayloadResult.data?.payload_json ?? null
                })
              }
            ]
          }
        ],
        systemInstruction: {
          parts: [{ text: systemPrompt }]
        },
        generationConfig: {
          mediaResolution: "MEDIA_RESOLUTION_LOW",
          maxOutputTokens: 900,
          thinkingConfig: { thinkingBudget: 0 },
          responseMimeType: "application/json",
          // Force exact JSON structure; Gemini sometimes omits or guesses
          // optional-looking fields when only given a text prompt.
          responseSchema: geminiResponseSchema
        }
      }),
      geminiGenerateTimeoutMs,
      "Vertex AI generation timed out"
    );
  } finally {
    heartbeat.stop();
    if (videoPartResult.gcsObjectName) {
      context.waitUntil(
        deleteVertexGcsObject(env, vertexConfig, videoPartResult.gcsObjectName)
          .then(() => {
            logStage("vertex_gcs_video_deleted");
          })
          .catch((error) => {
            logStage("vertex_gcs_video_delete_failed", {
              error: error instanceof Error ? error.message : String(error)
            });
          })
      );
    }
  }
  logStage("vertex_generate_completed", { textLength: responseText.length });

  if (!responseText) {
    throw new Error("Vertex AI returned empty text");
  }

  logStage("parsing_result");

  const parsed = parseGeminiResult(parseJsonObject(responseText));
  const expiresAt = new Date(Date.now() + resultExpiresInMs).toISOString();

  await requireNoSupabaseError(
    supabase.from("analysis_results").upsert(
      {
        session_id: sessionId,
        verdict: parsed.public_result.verdict,
        headline: parsed.public_result.headline,
        roast_comment: parsed.public_result.roast_comment,
        public_json: parsed.public_result,
        private_json: parsed.private_diagnostics,
        model_name: vertexConfig.model,
        prompt_version: promptVersion,
        expires_at: expiresAt
      },
      { onConflict: "session_id" }
    ),
    "Failed to save analysis result"
  );

  logStage("result_saved", { verdict: parsed.public_result.verdict });

  await requireNoSupabaseError(
    supabase.from("sessions").update({ status: "complete" }).eq("id", sessionId),
    "Failed to mark session complete"
  );

  logStage("completed", { totalMs: Date.now() - startedAt, modelName: vertexConfig.model });
}

async function buildGeminiVideoPart({
  env,
  vertexConfig,
  sessionId,
  recording,
  videoBytes,
  logStage
}: {
  env: Env;
  vertexConfig: ReturnType<typeof getVertexConfig>;
  sessionId: string;
  recording: RecordingRow;
  videoBytes: ArrayBuffer;
  logStage: (stage: string, fields?: Record<string, unknown>) => void;
}): Promise<VertexVideoPartResult> {
  const videoMetadata = {
    startOffset: `${Math.max(0, Math.floor(recording.target_start_ms / 1000))}s`,
    endOffset: `${Math.max(1, Math.ceil(recording.target_end_ms / 1000))}s`,
    fps: 3
  };
  const geminiMimeType = normalizeGeminiVideoMimeType(recording.mime_type);

  if (videoBytes.byteLength <= inlineVideoMaxBytes) {
    logStage("gemini_inline_video_prepared", {
      byteSize: videoBytes.byteLength,
      originalMimeType: recording.mime_type,
      geminiMimeType
    });
    return {
      source: "inline",
      part: {
        inlineData: {
          data: arrayBufferToBase64(videoBytes),
          mimeType: geminiMimeType
        },
        videoMetadata
      },
    };
  }

  const { gcsFileUri, gcsObjectName } = await uploadVertexVideoToGcs({
    env,
    vertexConfig,
    sessionId,
    recording,
    videoBytes,
    mimeType: geminiMimeType
  });
  logStage("vertex_gcs_video_prepared", {
    byteSize: videoBytes.byteLength,
    originalMimeType: recording.mime_type,
    geminiMimeType
  });

  return {
    source: "gcs",
    gcsObjectName,
    part: {
      fileData: { fileUri: gcsFileUri, mimeType: geminiMimeType },
      videoMetadata
    }
  };
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 32_768;
  let binary = "";

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return btoa(binary);
}

async function uploadVertexVideoToGcs({
  env,
  vertexConfig,
  sessionId,
  recording,
  videoBytes,
  mimeType
}: {
  env: Env;
  vertexConfig: ReturnType<typeof getVertexConfig>;
  sessionId: string;
  recording: RecordingRow;
  videoBytes: ArrayBuffer;
  mimeType: string;
}) {
  const bucket = vertexConfig.gcsBucket;
  if (!bucket) {
    throw new Error("VERTEX_AI_GCS_BUCKET is required for videos over the inline limit");
  }

  const extension = recording.mime_type.startsWith("video/mp4") ? "mp4" : "webm";
  const gcsObjectName = `vertex-inputs/${sessionId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const accessToken = await getVertexAccessToken(env);
  const uploadUrl = new URL(`https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`);
  uploadUrl.searchParams.set("uploadType", "media");
  uploadUrl.searchParams.set("name", gcsObjectName);

  const response = await fetch(uploadUrl.toString(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": mimeType,
      "content-length": String(videoBytes.byteLength)
    },
    body: videoBytes
  });

  if (!response.ok) {
    throw new Error(`Vertex AI GCS staging upload failed with status ${response.status}: ${await readErrorBody(response)}`);
  }

  return {
    gcsObjectName,
    gcsFileUri: `gs://${bucket}/${gcsObjectName}`
  };
}

async function deleteVertexGcsObject(
  env: Env,
  vertexConfig: ReturnType<typeof getVertexConfig>,
  gcsObjectName: string
) {
  if (!vertexConfig.gcsBucket) return;

  const accessToken = await getVertexAccessToken(env);
  const deleteUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(vertexConfig.gcsBucket)}/o/${encodeURIComponent(gcsObjectName)}`;
  const response = await fetch(deleteUrl, {
    method: "DELETE",
    headers: {
      authorization: `Bearer ${accessToken}`
    }
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Vertex AI GCS staging delete failed with status ${response.status}: ${await readErrorBody(response)}`);
  }
}

function getVertexConfig(env: Env) {
  if ((env.GOOGLE_GENAI_USE_VERTEXAI ?? "true").toLowerCase() !== "true") {
    throw new Error("GOOGLE_GENAI_USE_VERTEXAI must be true");
  }

  const project = env.GOOGLE_CLOUD_PROJECT?.trim();
  if (!project) {
    throw new Error("GOOGLE_CLOUD_PROJECT is required");
  }

  return {
    project,
    location: env.GOOGLE_CLOUD_LOCATION?.trim() || "global",
    model: env.VERTEX_AI_MODEL?.trim() || defaultVertexModel,
    gcsBucket: env.VERTEX_AI_GCS_BUCKET?.trim() || ""
  };
}

async function generateVertexContent(
  env: Env,
  config: ReturnType<typeof getVertexConfig>,
  body: Record<string, unknown>
) {
  const accessToken = await getVertexAccessToken(env);
  const response = await fetch(buildVertexGenerateUrl(config), {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`Vertex AI generateContent failed with status ${response.status}: ${await readErrorBody(response)}`);
  }

  const json = (await response.json()) as VertexGenerateResponse;
  return extractVertexText(json);
}

function buildVertexGenerateUrl({
  project,
  location,
  model
}: {
  project: string;
  location: string;
  model: string;
}) {
  const modelPath = model.includes("/") ? model : `publishers/google/models/${model}`;
  const fullPath = modelPath.startsWith("projects/")
    ? modelPath
    : `projects/${project}/locations/${location}/${modelPath}`;

  return `https://aiplatform.googleapis.com/v1/${encodePath(fullPath)}:generateContent`;
}

async function getVertexAccessToken(env: Env) {
  const serviceAccount = decodeServiceAccountKey(env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64);
  const nowMs = Date.now();
  if (
    cachedAccessToken?.serviceAccountEmail === serviceAccount.client_email &&
    cachedAccessToken.expiresAtMs - 60_000 > nowMs
  ) {
    return cachedAccessToken.accessToken;
  }

  const tokenUri = serviceAccount.token_uri?.trim() || defaultGoogleTokenUri;
  const assertion = await createServiceAccountJwt(serviceAccount, tokenUri, Math.floor(nowMs / 1000));
  const response = await fetch(tokenUri, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });

  if (!response.ok) {
    throw new Error(`Vertex AI auth failed with status ${response.status}: ${await readErrorBody(response)}`);
  }

  const tokenResponse = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof tokenResponse.access_token !== "string" || !tokenResponse.access_token) {
    throw new Error("Vertex AI auth response did not include an access token");
  }

  const expiresInSeconds = typeof tokenResponse.expires_in === "number" ? tokenResponse.expires_in : 3600;
  cachedAccessToken = {
    serviceAccountEmail: serviceAccount.client_email,
    accessToken: tokenResponse.access_token,
    expiresAtMs: nowMs + expiresInSeconds * 1000
  };

  return tokenResponse.access_token;
}

function decodeServiceAccountKey(encodedKey: string) {
  if (!encodedKey?.trim()) {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 is required");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(atob(encodedKey.replace(/\s/g, "")));
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 is not valid base64 JSON");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Google service account key must be a JSON object");
  }

  const candidate = parsed as Record<string, unknown>;
  if (typeof candidate.client_email !== "string" || typeof candidate.private_key !== "string") {
    throw new Error("Google service account key is missing client_email or private_key");
  }

  return {
    client_email: candidate.client_email,
    private_key: candidate.private_key,
    token_uri: typeof candidate.token_uri === "string" ? candidate.token_uri : undefined
  } satisfies ServiceAccountKey;
}

async function createServiceAccountJwt(serviceAccount: ServiceAccountKey, tokenUri: string, issuedAtSeconds: number) {
  const header = base64UrlEncodeJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlEncodeJson({
    iss: serviceAccount.client_email,
    scope: googleCloudPlatformScope,
    aud: tokenUri,
    iat: issuedAtSeconds,
    exp: issuedAtSeconds + 3600
  });
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemPrivateKeyToArrayBuffer(serviceAccount.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

function pemPrivateKeyToArrayBuffer(privateKey: string) {
  const base64 = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  return base64ToBytes(base64).buffer;
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function base64UrlEncodeJson(value: unknown) {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function extractVertexText(response: VertexGenerateResponse) {
  const text = response.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();

  if (!text) {
    throw new Error(`Vertex AI returned no text; finishReason=${response.candidates?.[0]?.finishReason ?? "unknown"}`);
  }

  return text;
}

async function readErrorBody(response: Response) {
  const raw = await response.text();
  if (!raw.trim()) {
    return response.statusText || "empty error body";
  }

  try {
    const json = JSON.parse(raw) as { error?: { message?: unknown; status?: unknown } };
    const message = typeof json.error?.message === "string" ? json.error.message : raw;
    const status = typeof json.error?.status === "string" ? ` (${json.error.status})` : "";
    return `${message}${status}`.slice(0, 800);
  } catch {
    return raw.slice(0, 800);
  }
}

function encodePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function classifyError(error: unknown): { code: string; message: string } {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const lower = raw.toLowerCase();

  let code = "worker_unknown";
  if (lower.includes("session not found")) code = "session_not_found";
  else if (lower.includes("session cannot be analyzed")) code = "session_state_invalid";
  else if (lower.includes("recording not found")) code = "recording_missing";
  else if (lower.includes("feature payload not found")) code = "feature_payload_missing";
  else if (lower.includes("r2 recording object")) code = "r2_object_missing";
  else if (lower.includes("vertex_ai_gcs_bucket")) code = "vertex_gcs_bucket_missing";
  else if (lower.includes("vertex ai gcs staging upload failed")) code = "vertex_gcs_upload_failed";
  else if (lower.includes("vertex ai gcs staging delete failed")) code = "vertex_gcs_delete_failed";
  else if (lower.includes("vertex ai returned empty") || lower.includes("vertex ai returned no text")) {
    code = "vertex_empty_response";
  }
  else if (lower.includes("vertex ai auth failed")) code = "vertex_auth_failed";
  else if (lower.includes("vertex ai generatecontent failed")) code = "vertex_generate_failed";
  else if (lower.includes("user location is not supported")) code = "gemini_region_unsupported";
  else if (lower.includes("invalid_argument") || lower.includes("invalid argument")) code = "gemini_invalid_argument";
  else if (lower.includes("vertex ai generation timed out")) code = "vertex_generation_timeout";
  else if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("deadline")) {
    code = "analysis_timeout";
  }
  else if (
    lower.includes("invalid input") ||
    lower.includes("expected int") ||
    lower.includes("too_small") ||
    lower.includes("too_big")
  ) code = "validation_failed";

  return { code, message: raw.slice(0, 800) };
}

async function markSessionFailed(sessionId: string, env: Env, error: unknown, context?: WorkerContext) {
  const { code, message } = classifyError(error);
  console.error("analyzeSession failed", {
    sessionId,
    code,
    message,
    error: error instanceof Error ? { name: error.name, stack: error.stack } : error
  });
  const supabase = createSupabase(env);
  await supabase
    .from("sessions")
    .update({
      status: "failed",
      error_code: code,
      error_detail: message,
      error_at: new Date().toISOString()
    })
    .eq("id", sessionId)
    .neq("status", "complete");

  if (context) {
    recordWorkerEvent(context, env, {
      event: "analysis_failed",
      level: "error",
      source: "worker_mark_failed",
      sessionId,
      errorCode: code,
      errorDetail: message
    });
  }
}

function createSupabase(env: Env) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });
}

async function requireNoSupabaseError<T>(promise: PromiseLike<{ error: unknown; data: T }>, message: string) {
  const { error, data } = await promise;
  if (error) {
    throw new Error(message);
  }
  return data;
}

function buildTextPayload({
  session,
  recording,
  featurePayload
}: {
  session: SessionRow;
  recording: RecordingRow;
  featurePayload: unknown;
}) {
  return JSON.stringify(
    {
      service_name: "AI 거짓말탐지기",
      locale: "ko",
      required_output: "Return only the JSON object matching schema_version 1.",
      questions: {
        warmup: session.warmup_question,
        target: session.target_question
      },
      transcript: {
        status: "unavailable",
        note: "Browser MVP has not attached speech-to-text yet. Use visible/audible answer context from the video."
      },
      recording: {
        duration_ms: recording.duration_ms,
        warmup_start_ms: recording.warmup_start_ms,
        warmup_end_ms: recording.warmup_end_ms,
        target_start_ms: recording.target_start_ms,
        target_end_ms: recording.target_end_ms,
        byte_size: recording.byte_size,
        mime_type: recording.mime_type
      },
      feature_payload: featurePayload,
      roast_examples: {
        lie: [
          "구라도 실력입니다 선생님. 조금 더 노력하세요.",
          "노력은 가상했는데 AI가 님보다 생각보다 똑똑합니다.",
          "양심은 집에 두고 왔나요? ㅋㅋ 하마터면 속을 뻔 했습니다.."
        ],
        truth: [
          "보기와는 다르게 생각보다 정직하신 편이네요.",
          "AI가 오늘 사람 한 명 구했습니다."
        ]
      }
    },
    null,
    2
  );
}

function parseJsonObject(text: string) {
  const trimmed = text.trim();
  const withoutFence = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(withoutFence);
}

function isAuthorized(request: Request, env: Env) {
  if (!env.WORKER_SHARED_SECRET) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${env.WORKER_SHARED_SECRET}`;
}

function uploadCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const headers = new Headers({
    "access-control-allow-methods": "PUT, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "300"
  });

  if (isAllowedUploadOrigin(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }

  return headers;
}

function isAllowedUploadOrigin(origin: string) {
  if (origin === "http://localhost:3000") return true;
  if (origin === "http://127.0.0.1:3000") return true;
  if (origin === "http://localhost:3001") return true;
  if (origin === "http://127.0.0.1:3001") return true;

  try {
    const url = new URL(origin);
    return url.protocol === "https:" && url.hostname.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function recordWorkerEvent(context: WorkerContext, env: Env, event: AxiomEvent) {
  context.waitUntil(logAxiomEvent(env, event).catch(() => undefined));
}

/*
 * Emit a periodic "still alive" event while a long async leg runs. The last
 * heartbeat before silence tells us exactly how long the worker survived —
 * the key signal for diagnosing background-execution eviction during the
 * Gemini call. Stops emitting once the caller calls stop().
 */
function startHeartbeat(
  context: WorkerContext,
  env: Env,
  sessionId: string,
  startedAt: number,
  phase: string
) {
  let beat = 0;
  const id = setInterval(() => {
    beat += 1;
    const elapsedMs = Date.now() - startedAt;
    console.log("[analyze] heartbeat", JSON.stringify({ sessionId, phase, beat, elapsedMs }));
    recordWorkerEvent(context, env, {
      event: "analysis_heartbeat",
      level: "info",
      source: "worker_analyze_session",
      sessionId,
      workerVersion,
      phase,
      beat,
      elapsedMs
    });
  }, heartbeatIntervalMs);

  return {
    stop() {
      clearInterval(id);
    }
  };
}

function withTimeout<T>(promise: PromiseLike<T>, ms: number, message: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`${message} after ${ms}ms`)), ms);
    })
  ]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}
