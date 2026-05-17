import { GoogleGenAI, type File as GeminiFile } from "@google/genai";
import { createClient } from "@supabase/supabase-js";
import { parseGeminiResult } from "../../src/lib/gemini/schema";

type R2ObjectBody = {
  arrayBuffer(): Promise<ArrayBuffer>;
};

type R2Bucket = {
  get(key: string): Promise<R2ObjectBody | null>;
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
- 질문과 진행 UI는 반말 톤을 기준으로 합니다.
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

    context.waitUntil(
      analyzeSession(sessionId, env).catch((error) => markSessionFailed(sessionId, env, error))
    );

    return Response.json({ status: "queued", sessionId });
  }
};

async function analyzeSession(sessionId: string, env: Env) {
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

  if (session.status === "complete" || session.status === "analyzing") {
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
    return;
  }

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
  const r2Object = await env.RECORDINGS.get(recording.r2_key);
  if (!r2Object) {
    throw new Error("R2 recording object not found");
  }

  const videoBytes = await r2Object.arrayBuffer();
  const geminiFile = await ai.files.upload({
    file: new Blob([videoBytes], { type: recording.mime_type }),
    config: {
      mimeType: recording.mime_type,
      displayName: `${sessionId}.${recording.mime_type.startsWith("video/mp4") ? "mp4" : "webm"}`
    }
  });
  const activeFile = await waitForGeminiFile(ai, geminiFile);

  if (!activeFile.uri) {
    throw new Error("Gemini file URI is missing");
  }

  const response = await ai.models.generateContent({
    model: modelName,
    contents: [
      {
        role: "user",
        parts: [
          {
            fileData: { fileUri: activeFile.uri, mimeType: recording.mime_type },
            videoMetadata: { fps: 1 }
          },
          {
            fileData: { fileUri: activeFile.uri, mimeType: recording.mime_type },
            videoMetadata: {
              startOffset: `${Math.floor(recording.target_start_ms / 1000)}s`,
              endOffset: `${Math.ceil(recording.target_end_ms / 1000)}s`,
              fps: 5
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
      responseMimeType: "application/json"
    }
  });

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

async function markSessionFailed(sessionId: string, env: Env, error: unknown) {
  console.error("analyzeSession failed", { sessionId, error });
  const supabase = createSupabase(env);
  await supabase.from("sessions").update({ status: "failed" }).eq("id", sessionId).neq("status", "complete");
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

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
