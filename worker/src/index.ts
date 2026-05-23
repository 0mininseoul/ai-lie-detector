import { GoogleGenAI, type File as GeminiFile } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
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
  GEMINI_API_KEY: string;
  GEMINI_MODEL?: string;
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

const defaultGeminiModel = "gemini-2.5-flash";
const promptVersion = 1;
const resultExpiresInMs = 48 * 60 * 60 * 1000;
const geminiUploadTimeoutMs = 45_000;
const geminiGenerateTimeoutMs = 75_000;

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
- 품질이 충분하면 quality_gate.status를 "pass"로 설정하고 public_result를 채웁니다.
- 품질이 너무 낮으면 quality_gate.status를 "retry"로 설정합니다.

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
      return Response.json({ ok: true });
    }

    if (url.pathname === "/upload") {
      if (request.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: uploadCorsHeaders(request) });
      }

      if (request.method === "PUT") {
        return handleUpload(request, env, url);
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

    recordWorkerEvent(context, env, {
      event: "analysis_queued",
      level: "info",
      source: "worker_analyze_route",
      sessionId
    });

    context.waitUntil(
      analyzeSession(sessionId, env, context).catch((error) => markSessionFailed(sessionId, env, error, context))
    );

    return Response.json({ status: "queued", sessionId });
  }
};

async function handleUpload(request: Request, env: Env, url: URL) {
  const corsHeaders = uploadCorsHeaders(request);
  const token = url.searchParams.get("token");

  if (!env.WORKER_SHARED_SECRET) {
    return Response.json({ error: "Upload is not configured" }, { status: 503, headers: corsHeaders });
  }

  const verification = await verifyWorkerUploadToken(token, env.WORKER_SHARED_SECRET);
  if (!verification.valid) {
    return Response.json({ error: verification.error }, { status: 401, headers: corsHeaders });
  }

  const { payload } = verification;
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType !== payload.mimeType) {
    return Response.json({ error: "Upload content type mismatch" }, { status: 400, headers: corsHeaders });
  }

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = Number(contentLengthHeader);
  if (!contentLengthHeader || !Number.isFinite(contentLength) || contentLength <= 0) {
    return Response.json({ error: "Upload content length is required" }, { status: 411, headers: corsHeaders });
  }

  if (payload.byteSize > maxWorkerUploadByteSize || contentLength > payload.byteSize) {
    return Response.json({ error: "Upload body is larger than expected" }, { status: 413, headers: corsHeaders });
  }

  if (!request.body) {
    return Response.json({ error: "Upload body is required" }, { status: 400, headers: corsHeaders });
  }

  await env.RECORDINGS.put(payload.r2Key, request.body, {
    httpMetadata: {
      contentType: payload.mimeType
    }
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
    recordWorkerEvent(context, env, {
      event: "analysis_stage",
      level: "info",
      source: "worker_analyze_session",
      sessionId,
      stage,
      elapsedMs: Date.now() - startedAt,
      ...fields
    });
  };

  logStage("started");

  const supabase = createSupabase(env);
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  const modelName = env.GEMINI_MODEL ?? defaultGeminiModel;

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

  const geminiFile = await withTimeout(
    ai.files.upload({
      file: new Blob([videoBytes], { type: recording.mime_type }),
      config: {
        mimeType: recording.mime_type,
        displayName: `${sessionId}.${recording.mime_type.startsWith("video/mp4") ? "mp4" : "webm"}`
      }
    }),
    geminiUploadTimeoutMs,
    "Gemini file upload timed out"
  );
  logStage("gemini_uploaded", { fileName: geminiFile.name ?? null, fileState: geminiFile.state ?? null });

  const activeFile = await waitForGeminiFile(ai, geminiFile);
  logStage("gemini_file_active", { fileName: activeFile.name ?? null });

  if (!activeFile.uri) {
    throw new Error("Gemini file URI is missing");
  }

  logStage("gemini_generate_started", { modelName });
  const response = await withTimeout(
    ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: { fileUri: activeFile.uri, mimeType: recording.mime_type },
              videoMetadata: {
                startOffset: `${Math.max(0, Math.floor(recording.target_start_ms / 1000))}s`,
                endOffset: `${Math.max(1, Math.ceil(recording.target_end_ms / 1000))}s`,
                fps: 4
              }
            },
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
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        // Force exact JSON structure; Gemini sometimes omits or guesses
        // optional-looking fields when only given a text prompt.
        responseSchema: geminiResponseSchema as unknown as Record<string, unknown>
      }
    }),
    geminiGenerateTimeoutMs,
    "Gemini generation timed out"
  );
  logStage("gemini_generate_completed");

  if (!response.text) {
    throw new Error("Gemini returned empty text");
  }

  const parsed = parseGeminiResult(parseJsonObject(response.text));
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
        model_name: modelName,
        prompt_version: promptVersion,
        expires_at: expiresAt
      },
      { onConflict: "session_id" }
    ),
    "Failed to save analysis result"
  );

  await requireNoSupabaseError(
    supabase.from("sessions").update({ status: "complete" }).eq("id", sessionId),
    "Failed to mark session complete"
  );

  logStage("completed", { totalMs: Date.now() - startedAt, modelName });
}

async function waitForGeminiFile(ai: GoogleGenAI, file: GeminiFile) {
  if (!file.name) {
    return file;
  }

  let current = file;
  for (let attempt = 0; attempt < 24; attempt += 1) {
    if (!current.state || current.state === "ACTIVE") {
      return current;
    }

    if (current.state === "FAILED") {
      throw new Error("Gemini file processing failed");
    }

    await sleep(2500);
    current = await ai.files.get({ name: file.name });
  }

  throw new Error("Gemini file processing timed out");
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
  else if (lower.includes("gemini file uri")) code = "gemini_file_uri_missing";
  else if (lower.includes("gemini returned empty")) code = "gemini_empty_response";
  else if (lower.includes("gemini file processing failed")) code = "gemini_processing_failed";
  else if (lower.includes("user location is not supported")) code = "gemini_region_unsupported";
  else if (lower.includes("gemini file upload timed out")) code = "gemini_upload_timeout";
  else if (lower.includes("gemini file processing timed out")) code = "gemini_file_timeout";
  else if (lower.includes("gemini generation timed out")) code = "gemini_generation_timeout";
  else if (lower.includes("timed out") || lower.includes("timeout") || lower.includes("deadline")) {
    code = "analysis_timeout";
  }
  else if (lower.includes("invalid input") || lower.includes("expected int")) code = "validation_failed";

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
