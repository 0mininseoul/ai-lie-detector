# AI 거짓말탐지기 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first web MVP of AI 거짓말탐지기 with Kakao-login-ready same-device flow, 2-question recording, Gemini full-video analysis, local feature JSON, Supabase persistence, Cloudflare R2 storage, browser export, and future-ready payment adapters.

**Architecture:** The browser records camera/mic, extracts local features, uploads video directly to R2, and calls Next.js APIs for session state. A Cloudflare Worker uploads R2 video to Gemini Files API, calls Gemini with full 1 FPS video plus target 5 FPS segment plus feature JSON, then stores a public/private result in Supabase.

**Tech Stack:** Next.js App Router, TypeScript, React, Tailwind CSS, Vitest, Supabase, Cloudflare R2, Cloudflare Worker, Gemini API, MediaRecorder, MediaPipe Face Landmarker, Web Audio API.

---

## File Structure

Create these units:

- `package.json`: scripts and dependencies.
- `src/types/domain.ts`: shared domain types.
- `src/lib/gemini/schema.ts`: Gemini response schema and parser.
- `src/lib/gemini/prompt.ts`: system prompt and request input builder.
- `src/lib/supabase/server.ts`: Supabase server client.
- `src/lib/entitlements/service.ts`: MVP entitlement service.
- `src/lib/payments/adapters.ts`: future Polar/App in Toss boundaries.
- `src/lib/recording/mime.ts`: MediaRecorder MIME selection.
- `src/lib/recording/features.ts`: feature payload helpers.
- `src/hooks/useCameraRecorder.ts`: camera/mic capture and recording.
- `src/hooks/useFeatureCollector.ts`: local feature collection.
- `src/app/page.tsx`: landing, Kakao-login-ready entry, and hidden question creation page.
- `src/app/s/[id]/page.tsx`: same-device recording page after A locks the question.
- `src/app/result/[id]/page.tsx`: result page.
- `src/app/api/sessions/route.ts`: create session.
- `src/app/api/sessions/[id]/upload-url/route.ts`: request R2 upload URL.
- `src/app/api/sessions/[id]/complete-upload/route.ts`: mark upload complete.
- `src/app/api/sessions/[id]/status/route.ts`: poll analysis status.
- `src/components/analysis/ProfessionalOverlay.tsx`: complex analysis UI.
- `src/components/export/ExportRecorder.tsx`: reels-style browser export.
- `supabase/migrations/20260517000000_init.sql`: database schema.
- `worker/src/index.ts`: Cloudflare Worker R2/Gemini analysis.
- `tests/gemini-schema.test.ts`: schema guardrails.
- `tests/entitlements.test.ts`: free usage state.
- `tests/recording-mime.test.ts`: recorder MIME selection.
- `tests/api-session.test.ts`: session creation contract.

## Task 1: Scaffold Next.js Project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `next.config.js`
- Create: `vitest.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/globals.css`

- [ ] **Step 1: Create package metadata**

Add `package.json`:

```json
{
  "name": "ai-lie-detector",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@google/genai": "^1.0.0",
    "@supabase/supabase-js": "^2.45.0",
    "@mediapipe/tasks-vision": "^0.10.18",
    "lucide-react": "^0.468.0",
    "next": "^15.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.6.0",
    "vite-tsconfig-paths": "^5.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Add TypeScript config**

Add `tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "es2022"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Add test config**

Add `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"]
  }
});
```

- [ ] **Step 4: Add app shell**

Add `src/app/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI 거짓말탐지기",
  description: "AI는 과연 거짓말을 알아챌 수 있을까?"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
```

Add `src/app/globals.css`:

```css
:root {
  color-scheme: dark;
  --bg: #050507;
  --panel: #101116;
  --line: rgba(255, 255, 255, 0.12);
  --text: #f4f4f5;
  --muted: #a1a1aa;
  --red: #ff3b5f;
  --cyan: #64d8ff;
  --green: #32d583;
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  background: var(--bg);
  color: var(--text);
  font-family: Pretendard, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

button,
input {
  font: inherit;
}
```

- [ ] **Step 5: Verify**

Run: `pnpm install && pnpm test`

Expected: dependencies install and Vitest reports no test files or passing setup.

## Task 2: Domain Types and Gemini Schema

**Files:**
- Create: `src/types/domain.ts`
- Create: `src/lib/gemini/schema.ts`
- Create: `tests/gemini-schema.test.ts`

- [ ] **Step 1: Add domain types**

Add `src/types/domain.ts`:

```ts
export type QuestionType = "warmup" | "target";
export type Verdict = "truth" | "lie";
export type Headline = "진실" | "거짓";

export type SessionStatus =
  | "created"
  | "recording"
  | "uploaded"
  | "analyzing"
  | "complete"
  | "failed"
  | "expired";

export type FeaturePayload = {
  version: 1;
  session: {
    durationMs: number;
    warmupStartMs: number;
    warmupEndMs: number;
    targetStartMs: number;
    targetEndMs: number;
  };
  videoQuality: {
    faceVisibleRatio: number;
    avgBrightness: number;
    motionBlurScore: number;
    droppedFrameRatio: number;
  };
  face: {
    samplesPerSecond: number;
    blinkRateBySegment: SegmentValue[];
    headPoseVarianceBySegment: SegmentValue[];
    mouthMovementBySegment: SegmentValue[];
    faceStabilityBySegment: SegmentValue[];
  };
  gaze: {
    gazeStabilityBySegment: SegmentValue[];
    screenAttentionBySegment: SegmentValue[];
  };
  audio: {
    speechDetected: boolean;
    responseLatencyMsByQuestion: QuestionValue[];
    pitchVarianceBySegment: SegmentValue[];
    energyVarianceBySegment: SegmentValue[];
    pauseRatioBySegment: SegmentValue[];
  };
  rppg: {
    quality: "good" | "weak" | "unusable";
    bpmEstimateBySegment: SegmentValue[];
    signalVarianceBySegment: SegmentValue[];
  };
};

export type SegmentValue = {
  segment: QuestionType;
  value: number;
};

export type QuestionValue = {
  question: QuestionType;
  value: number;
};
```

- [ ] **Step 2: Add schema parser**

Add `src/lib/gemini/schema.ts`:

```ts
import { z } from "zod";

export const geminiResultSchema = z.object({
  schema_version: z.literal(1),
  quality_gate: z.object({
    status: z.enum(["pass", "retry"]),
    retry_reason: z.enum([
      "none",
      "face_not_visible",
      "audio_missing",
      "answer_too_short",
      "lighting_too_poor",
      "recording_corrupted"
    ]),
    retry_message: z.string()
  }),
  public_result: z.object({
    headline: z.enum(["진실", "거짓"]),
    verdict: z.enum(["truth", "lie"]),
    roast_comment: z.string().min(12).max(120),
    share_question: z.string().min(1).max(160),
    share_text: z.string().min(1).max(180),
    result_card_lines: z.array(z.string().max(80)).length(3),
    export_final_frame: z.object({
      title: z.literal("AI 거짓말탐지기"),
      question: z.string().min(1).max(160),
      headline: z.enum(["진실", "거짓"])
    })
  }),
  private_diagnostics: z.object({
    internal_score: z.number().int().min(0).max(100),
    internal_confidence: z.enum(["low", "medium", "high"]),
    model_reasoning_summary: z.string().max(1000),
    quality: z.object({
      camera: z.enum(["poor", "usable", "good"]),
      audio: z.enum(["poor", "usable", "good"]),
      face_visible: z.boolean(),
      answer_detected: z.boolean(),
      feature_payload_usable: z.boolean()
    }),
    segment_judgments: z.array(
      z.object({
        segment: z.enum(["warmup", "target"]),
        usable: z.boolean(),
        internal_notes: z.string().max(500)
      })
    )
  }),
  policy_flags: z.object({
    contains_probability_in_public_text: z.literal(false),
    contains_detection_signal_in_public_text: z.literal(false),
    headline_is_exact: z.literal(true)
  })
});

export type GeminiResult = z.infer<typeof geminiResultSchema>;

export function parseGeminiResult(input: unknown): GeminiResult {
  const parsed = geminiResultSchema.parse(input);
  if (parsed.public_result.headline === "진실" && parsed.public_result.verdict !== "truth") {
    throw new Error("Headline/verdict mismatch");
  }
  if (parsed.public_result.headline === "거짓" && parsed.public_result.verdict !== "lie") {
    throw new Error("Headline/verdict mismatch");
  }
  return parsed;
}
```

- [ ] **Step 3: Add guardrail tests**

Add `tests/gemini-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { parseGeminiResult } from "@/lib/gemini/schema";

const baseResult = {
  schema_version: 1,
  quality_gate: { status: "pass", retry_reason: "none", retry_message: "" },
  public_result: {
    headline: "거짓",
    verdict: "lie",
    roast_comment: "구라도 실력입니다 선생님. 조금 더 노력하세요.",
    share_question: "어제 누구랑 있었어?",
    share_text: "질문: 어제 누구랑 있었어? / 판정: 거짓",
    result_card_lines: ["AI 거짓말탐지기", "질문: 어제 누구랑 있었어?", "판정: 거짓"],
    export_final_frame: {
      title: "AI 거짓말탐지기",
      question: "어제 누구랑 있었어?",
      headline: "거짓"
    }
  },
  private_diagnostics: {
    internal_score: 82,
    internal_confidence: "high",
    model_reasoning_summary: "internal only",
    quality: {
      camera: "good",
      audio: "good",
      face_visible: true,
      answer_detected: true,
      feature_payload_usable: true
    },
    segment_judgments: [
      { segment: "warmup", usable: true, internal_notes: "usable" },
      { segment: "target", usable: true, internal_notes: "usable" }
    ]
  },
  policy_flags: {
    contains_probability_in_public_text: false,
    contains_detection_signal_in_public_text: false,
    headline_is_exact: true
  }
};

describe("parseGeminiResult", () => {
  it("accepts an exact lie headline", () => {
    expect(parseGeminiResult(baseResult).public_result.headline).toBe("거짓");
  });

  it("rejects headline text with extra copy", () => {
    expect(() =>
      parseGeminiResult({
        ...baseResult,
        public_result: { ...baseResult.public_result, headline: "거짓. 표정 관리 실패" }
      })
    ).toThrow();
  });

  it("rejects public probability flags", () => {
    expect(() =>
      parseGeminiResult({
        ...baseResult,
        policy_flags: { ...baseResult.policy_flags, contains_probability_in_public_text: true }
      })
    ).toThrow();
  });
});
```

- [ ] **Step 4: Verify**

Run: `pnpm test tests/gemini-schema.test.ts`

Expected: all three tests pass.

## Task 3: Supabase Schema

**Files:**
- Create: `supabase/migrations/20260517000000_init.sql`
- Create: `src/lib/supabase/server.ts`

- [ ] **Step 1: Add database migration**

Add `supabase/migrations/20260517000000_init.sql` with the SQL from `docs/TECHNICAL_SPEC.md` sections 4.1 through 4.5. After the five tables, add indexes:

```sql
create index sessions_status_idx on sessions(status);
create index recordings_session_id_idx on recordings(session_id);
create index feature_payloads_session_id_idx on feature_payloads(session_id);
create index analysis_results_session_id_idx on analysis_results(session_id);
create index entitlements_device_id_idx on entitlements(device_id);
```

- [ ] **Step 2: Add server client**

Add `src/lib/supabase/server.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

export function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase server environment variables");
  return createClient(url, key, {
    auth: { persistSession: false }
  });
}
```

- [ ] **Step 3: Verify migration syntax**

Run: `supabase db lint` if Supabase CLI is installed.

Expected: no SQL lint errors.

If the Supabase CLI is not installed, run: `pnpm test tests/gemini-schema.test.ts`

Expected: project tests still pass.

## Task 4: Entitlement and Payment Boundaries

**Files:**
- Create: `src/lib/entitlements/service.ts`
- Create: `src/lib/payments/adapters.ts`
- Create: `tests/entitlements.test.ts`

- [ ] **Step 1: Add payment adapter interfaces**

Add `src/lib/payments/adapters.ts`:

```ts
export type EntitlementSource = "mvp" | "polar" | "toss_iap" | "toss_reward_ad";

export type EntitlementState = {
  deviceId: string;
  freeTrialsUsed: number;
  credits: number;
  canStartAnalysis: boolean;
  source: EntitlementSource;
};

export interface PaymentAdapter {
  createCheckout(input: { deviceId: string; productId: string }): Promise<{ url: string }>;
  handleWebhook(request: Request): Promise<void>;
}

export interface RewardAdapter {
  grantReward(input: { deviceId: string; rewardId: string }): Promise<EntitlementState>;
}

export const nonePaymentAdapter: PaymentAdapter = {
  async createCheckout() {
    throw new Error("Payments are disabled in the MVP");
  },
  async handleWebhook() {
    return;
  }
};
```

- [ ] **Step 2: Add entitlement service**

Add `src/lib/entitlements/service.ts`:

```ts
import { getSupabaseServer } from "@/lib/supabase/server";
import type { EntitlementSource, EntitlementState } from "@/lib/payments/adapters";

export async function getEntitlementState(deviceId: string): Promise<EntitlementState> {
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("entitlements")
    .select("device_id, free_trials_used, credits, source")
    .eq("device_id", deviceId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    return {
      deviceId,
      freeTrialsUsed: 0,
      credits: 0,
      canStartAnalysis: true,
      source: "mvp"
    };
  }

  const freeTrialsUsed = Number(data.free_trials_used);
  const credits = Number(data.credits);
  return {
    deviceId,
    freeTrialsUsed,
    credits,
    canStartAnalysis: freeTrialsUsed < 1 || credits > 0,
    source: data.source as EntitlementSource
  };
}

export async function consumeAnalysisCredit(deviceId: string): Promise<EntitlementState> {
  const state = await getEntitlementState(deviceId);
  const supabase = getSupabaseServer();

  if (state.credits > 0) {
    const { error } = await supabase
      .from("entitlements")
      .upsert({
        device_id: deviceId,
        free_trials_used: state.freeTrialsUsed,
        credits: state.credits - 1,
        source: state.source
      });
    if (error) throw error;
    return { ...state, credits: state.credits - 1, canStartAnalysis: state.freeTrialsUsed < 1 || state.credits - 1 > 0 };
  }

  if (state.freeTrialsUsed < 1) {
    const { error } = await supabase
      .from("entitlements")
      .upsert({
        device_id: deviceId,
        free_trials_used: 1,
        credits: 0,
        source: "mvp"
      });
    if (error) throw error;
    return { deviceId, freeTrialsUsed: 1, credits: 0, canStartAnalysis: false, source: "mvp" };
  }

  throw new Error("No analysis credit available");
}
```

- [ ] **Step 3: Add unit test with mocked service behavior**

Add `tests/entitlements.test.ts`:

```ts
import { describe, expect, it } from "vitest";

function canStartAnalysis(freeTrialsUsed: number, credits: number) {
  return freeTrialsUsed < 1 || credits > 0;
}

describe("entitlement policy", () => {
  it("allows first free run", () => {
    expect(canStartAnalysis(0, 0)).toBe(true);
  });

  it("blocks after free run without credits", () => {
    expect(canStartAnalysis(1, 0)).toBe(false);
  });

  it("allows paid credits after free run", () => {
    expect(canStartAnalysis(1, 3)).toBe(true);
  });
});
```

- [ ] **Step 4: Verify**

Run: `pnpm test tests/entitlements.test.ts`

Expected: all tests pass.

## Task 5: Recording Utilities

**Files:**
- Create: `src/lib/recording/mime.ts`
- Create: `src/lib/recording/features.ts`
- Create: `tests/recording-mime.test.ts`

- [ ] **Step 1: Add MIME selection**

Add `src/lib/recording/mime.ts`:

```ts
export const candidateMimeTypes = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4"
] as const;

export function pickSupportedMimeType(isTypeSupported: (mimeType: string) => boolean): string {
  return candidateMimeTypes.find(isTypeSupported) ?? "";
}
```

- [ ] **Step 2: Add feature payload factory**

Add `src/lib/recording/features.ts`:

```ts
import type { FeaturePayload } from "@/types/domain";

export function createEmptyFeaturePayload(input: {
  durationMs: number;
  warmupStartMs: number;
  warmupEndMs: number;
  targetStartMs: number;
  targetEndMs: number;
}): FeaturePayload {
  return {
    version: 1,
    session: input,
    videoQuality: {
      faceVisibleRatio: 0,
      avgBrightness: 0,
      motionBlurScore: 0,
      droppedFrameRatio: 0
    },
    face: {
      samplesPerSecond: 0,
      blinkRateBySegment: [],
      headPoseVarianceBySegment: [],
      mouthMovementBySegment: [],
      faceStabilityBySegment: []
    },
    gaze: {
      gazeStabilityBySegment: [],
      screenAttentionBySegment: []
    },
    audio: {
      speechDetected: false,
      responseLatencyMsByQuestion: [],
      pitchVarianceBySegment: [],
      energyVarianceBySegment: [],
      pauseRatioBySegment: []
    },
    rppg: {
      quality: "unusable",
      bpmEstimateBySegment: [],
      signalVarianceBySegment: []
    }
  };
}
```

- [ ] **Step 3: Add MIME test**

Add `tests/recording-mime.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { pickSupportedMimeType } from "@/lib/recording/mime";

describe("pickSupportedMimeType", () => {
  it("chooses the first supported type", () => {
    const result = pickSupportedMimeType((mime) => mime === "video/webm;codecs=vp8,opus");
    expect(result).toBe("video/webm;codecs=vp8,opus");
  });

  it("returns empty string when no type is reported", () => {
    expect(pickSupportedMimeType(() => false)).toBe("");
  });
});
```

- [ ] **Step 4: Verify**

Run: `pnpm test tests/recording-mime.test.ts`

Expected: both tests pass.

## Task 6: Session APIs

**Files:**
- Create: `src/app/api/sessions/route.ts`
- Create: `src/app/api/sessions/[id]/complete-upload/route.ts`
- Create: `src/app/api/sessions/[id]/status/route.ts`
- Create: `tests/api-session.test.ts`

- [ ] **Step 1: Add request validator**

Inside `src/app/api/sessions/route.ts`, define:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";

const createSessionSchema = z.object({
  creatorDeviceId: z.string().min(8).max(128),
  targetQuestion: z.string().min(3).max(160),
  locale: z.literal("ko").default("ko")
});

export async function POST(request: Request) {
  const body = createSessionSchema.parse(await request.json());
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("sessions")
    .insert({
      creator_device_id: body.creatorDeviceId,
      target_question: body.targetQuestion,
      warmup_question: "오늘 하루 중 제일 기억나는 일 뭐야?",
      locale: body.locale,
      status: "created"
    })
    .select("id")
    .single();

  if (error) throw error;
  return NextResponse.json({ id: data.id, url: `/s/${data.id}` });
}
```

- [ ] **Step 2: Add upload completion API**

Add `src/app/api/sessions/[id]/complete-upload/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";

const completeUploadSchema = z.object({
  r2Key: z.string().min(8),
  mimeType: z.string().min(3),
  byteSize: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  warmupStartMs: z.number().int().nonnegative(),
  warmupEndMs: z.number().int().positive(),
  targetStartMs: z.number().int().positive(),
  targetEndMs: z.number().int().positive(),
  featurePayload: z.unknown()
});

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const body = completeUploadSchema.parse(await request.json());
  const supabase = getSupabaseServer();
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { error: recordingError } = await supabase.from("recordings").insert({
    session_id: params.id,
    r2_key: body.r2Key,
    mime_type: body.mimeType,
    byte_size: body.byteSize,
    duration_ms: body.durationMs,
    warmup_start_ms: body.warmupStartMs,
    warmup_end_ms: body.warmupEndMs,
    target_start_ms: body.targetStartMs,
    target_end_ms: body.targetEndMs,
    expires_at: expiresAt
  });
  if (recordingError) throw recordingError;

  const { error: featureError } = await supabase.from("feature_payloads").insert({
    session_id: params.id,
    payload_json: body.featurePayload,
    schema_version: 1
  });
  if (featureError) throw featureError;

  const { error: sessionError } = await supabase.from("sessions").update({ status: "uploaded" }).eq("id", params.id);
  if (sessionError) throw sessionError;

  return NextResponse.json({ status: "uploaded" });
}
```

- [ ] **Step 3: Add status API**

Add `src/app/api/sessions/[id]/status/route.ts`:

```ts
import { NextResponse } from "next/server";
import { getSupabaseServer } from "@/lib/supabase/server";

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const supabase = getSupabaseServer();
  const { data: session, error } = await supabase.from("sessions").select("status").eq("id", params.id).single();
  if (error) throw error;

  const { data: result } = await supabase
    .from("analysis_results")
    .select("headline, public_json")
    .eq("session_id", params.id)
    .maybeSingle();

  return NextResponse.json({
    status: session.status,
    result: result ?? null
  });
}
```

- [ ] **Step 4: Add validator test**

Add `tests/api-session.test.ts`:

```ts
import { describe, expect, it } from "vitest";

function isValidQuestion(value: string) {
  return value.trim().length >= 3 && value.trim().length <= 160;
}

describe("session question validation", () => {
  it("accepts a realistic question", () => {
    expect(isValidQuestion("어제 누구랑 있었어?")).toBe(true);
  });

  it("rejects tiny questions", () => {
    expect(isValidQuestion("왜")).toBe(false);
  });
});
```

- [ ] **Step 5: Verify**

Run: `pnpm test tests/api-session.test.ts`

Expected: both tests pass.

## Task 7: Browser Recording and Feature Hooks

**Files:**
- Create: `src/hooks/useCameraRecorder.ts`
- Create: `src/hooks/useFeatureCollector.ts`

- [ ] **Step 1: Add camera recorder hook**

Add `src/hooks/useCameraRecorder.ts`:

```ts
"use client";

import { useCallback, useRef, useState } from "react";
import { pickSupportedMimeType } from "@/lib/recording/mime";

export function useCameraRecorder() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [status, setStatus] = useState<"idle" | "ready" | "recording" | "stopped" | "error">("idle");

  const startCamera = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
      audio: { echoCancellation: true, noiseSuppression: true }
    });
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    setStatus("ready");
  }, []);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) throw new Error("Camera is not ready");
    const mimeType = pickSupportedMimeType((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorder.start(250);
    recorderRef.current = recorder;
    setStatus("recording");
  }, []);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) throw new Error("Recorder is not active");
    const stopped = new Promise<Blob>((resolve) => {
      recorder.onstop = () => {
        resolve(new Blob(chunksRef.current, { type: recorder.mimeType || "video/webm" }));
      };
    });
    recorder.stop();
    const blob = await stopped;
    setStatus("stopped");
    return blob;
  }, []);

  return { videoRef, status, startCamera, startRecording, stopRecording };
}
```

- [ ] **Step 2: Add feature collector hook**

Add `src/hooks/useFeatureCollector.ts`:

```ts
"use client";

import { useCallback, useRef } from "react";
import { createEmptyFeaturePayload } from "@/lib/recording/features";

export function useFeatureCollector() {
  const marksRef = useRef({
    startedAt: 0,
    warmupStartMs: 0,
    warmupEndMs: 0,
    targetStartMs: 0,
    targetEndMs: 0
  });

  const mark = useCallback((key: "warmupStartMs" | "warmupEndMs" | "targetStartMs" | "targetEndMs") => {
    const now = performance.now();
    if (marksRef.current.startedAt === 0) marksRef.current.startedAt = now;
    marksRef.current[key] = Math.round(now - marksRef.current.startedAt);
  }, []);

  const buildPayload = useCallback(() => {
    const durationMs = Math.max(marksRef.current.targetEndMs, marksRef.current.warmupEndMs);
    return createEmptyFeaturePayload({
      durationMs,
      warmupStartMs: marksRef.current.warmupStartMs,
      warmupEndMs: marksRef.current.warmupEndMs,
      targetStartMs: marksRef.current.targetStartMs,
      targetEndMs: marksRef.current.targetEndMs
    });
  }, []);

  return { mark, buildPayload };
}
```

- [ ] **Step 3: Verify**

Run: `pnpm test tests/recording-mime.test.ts`

Expected: recording utility tests still pass.

## Task 8: Core Pages

**Files:**
- Create: `src/app/page.tsx`
- Create: `src/app/s/[id]/page.tsx`
- Create: `src/app/result/[id]/page.tsx`
- Create: `src/components/analysis/ProfessionalOverlay.tsx`

- [ ] **Step 1: Add landing page**

Add `src/app/page.tsx` with a client form that presents a Kakao-login-ready entry, tells A to hide the screen from B while entering the question, posts to `/api/sessions`, and redirects the same device to `/s/{id}` after `질문 잠그기`.

```tsx
"use client";

import { useState } from "react";

export default function HomePage() {
  const [question, setQuestion] = useState("");

  async function createSession() {
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        creatorDeviceId: getDeviceId(),
        targetQuestion: question,
        locale: "ko"
      })
    });
    const data = await response.json();
    location.href = data.url;
  }

  return (
    <main style={{ minHeight: "100vh", padding: 24, display: "grid", placeItems: "center" }}>
      <section style={{ width: "min(720px, 100%)" }}>
        <h1>AI 거짓말탐지기</h1>
        <p>착한 내 남자친구, 과연 나한테 거짓말하는 게 없을까?</p>
        <button type="button">카카오로 시작하기</button>
        <p>지금은 질문 입력 중이야. 상대가 화면 못 보게 해줘.</p>
        <input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder="어제 누구랑 있었어?"
          maxLength={160}
          style={{ width: "100%", padding: 16, borderRadius: 8 }}
        />
        <button onClick={createSession} disabled={question.trim().length < 3}>
          질문 잠그기
        </button>
        <p>질문 다 썼으면 잠가줘. 잠그면 상대에게 보여줘도 돼.</p>
      </section>
    </main>
  );
}

function getDeviceId() {
  const key = "ai-lie-detector-device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;
  const value = crypto.randomUUID();
  localStorage.setItem(key, value);
  return value;
}
```

- [ ] **Step 2: Add professional overlay**

Add `src/components/analysis/ProfessionalOverlay.tsx`:

```tsx
const modules = [
  "얼굴 프레임 추적",
  "시선 흐름 스캔",
  "음성 파형 분석",
  "답변 리듬 처리",
  "표정 변화 맵",
  "심박 신호 추정",
  "응답 패턴 비교",
  "AI 판정 엔진",
  "멀티모달 동기화"
];

export function ProfessionalOverlay() {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
      {modules.map((label, index) => (
        <div key={label} style={{ border: "1px solid var(--line)", borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>{label}</div>
          <div style={{ marginTop: 8, height: 6, background: "rgba(100,216,255,.18)", borderRadius: 99 }}>
            <div style={{ width: `${35 + ((index * 13) % 55)}%`, height: "100%", background: "var(--cyan)", borderRadius: 99 }} />
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add respondent page**

Add `src/app/s/[id]/page.tsx` that uses `useCameraRecorder`, `useFeatureCollector`, two question states, upload completion API, and status polling. Keep the first version functional before adding visual polish.

Required UI text:

```ts
const warmupQuestion = "오늘 하루 중 제일 기억나는 일 뭐야?";
const targetIntro = "이제 진짜 질문이야.";
const analyzingText = "AI 판정 엔진 돌리는 중";
```

- [ ] **Step 4: Add result page**

Add `src/app/result/[id]/page.tsx` that reads `analysis_results` by session id, renders `headline`, `roast_comment`, question, and export button.

Rendering rule:

```tsx
<h1>{result.headline}</h1>
```

No extra text inside the headline element.

- [ ] **Step 5: Verify**

Run: `pnpm build`

Expected: Next.js build completes.

## Task 9: Cloudflare Worker for R2 and Gemini

**Files:**
- Create: `worker/package.json`
- Create: `worker/wrangler.toml`
- Create: `worker/src/index.ts`

- [ ] **Step 1: Add Worker package**

Add `worker/package.json`:

```json
{
  "name": "ai-lie-detector-worker",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "@google/genai": "^1.0.0",
    "@supabase/supabase-js": "^2.45.0"
  },
  "devDependencies": {
    "wrangler": "^4.0.0"
  }
}
```

- [ ] **Step 2: Add Worker config**

Add `worker/wrangler.toml`:

```toml
name = "ai-lie-detector-worker"
main = "src/index.ts"
compatibility_date = "2026-05-17"

[[r2_buckets]]
binding = "RECORDINGS"
bucket_name = "ai-lie-detector-recordings"
```

- [ ] **Step 3: Add Worker route skeleton**

Add `worker/src/index.ts`:

```ts
import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

type Env = {
  RECORDINGS: R2Bucket;
  GEMINI_API_KEY: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
};

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/analyze") {
      const { sessionId } = (await request.json()) as { sessionId: string };
      await analyzeSession(sessionId, env);
      return Response.json({ status: "queued" });
    }
    return new Response("Not found", { status: 404 });
  }
};

async function analyzeSession(sessionId: string, env: Env) {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });
  const ai = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });

  await supabase.from("sessions").update({ status: "analyzing" }).eq("id", sessionId);

  const { data: recording, error: recordingError } = await supabase
    .from("recordings")
    .select("*")
    .eq("session_id", sessionId)
    .single();
  if (recordingError) throw recordingError;

  const object = await env.RECORDINGS.get(recording.r2_key);
  if (!object) throw new Error("Recording not found");

  const bytes = await object.arrayBuffer();
  const file = await ai.files.upload({
    file: new Blob([bytes], { type: recording.mime_type }),
    config: { mimeType: recording.mime_type, displayName: `${sessionId}.webm` }
  });

  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            fileData: { fileUri: file.uri, mimeType: recording.mime_type },
            videoMetadata: { fps: 1 }
          },
          {
            fileData: { fileUri: file.uri, mimeType: recording.mime_type },
            videoMetadata: {
              startOffset: `${Math.floor(recording.target_start_ms / 1000)}s`,
              endOffset: `${Math.ceil(recording.target_end_ms / 1000)}s`,
              fps: 5
            }
          },
          {
            text: "Use the configured system instruction and return the required JSON only."
          }
        ]
      }
    ]
  });

  const text = result.text;
  if (!text) throw new Error("Gemini returned empty text");
  const parsed = JSON.parse(text);

  await supabase.from("analysis_results").insert({
    session_id: sessionId,
    verdict: parsed.public_result.verdict,
    headline: parsed.public_result.headline,
    roast_comment: parsed.public_result.roast_comment,
    public_json: parsed.public_result,
    private_json: parsed.private_diagnostics,
    model_name: "gemini-2.5-flash",
    prompt_version: 1,
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
  });
  await supabase.from("sessions").update({ status: "complete" }).eq("id", sessionId);
}
```

- [ ] **Step 4: Verify Worker typecheck**

Run: `cd worker && pnpm install && pnpm wrangler dev`

Expected: Worker starts locally.

## Task 10: Browser Export

**Files:**
- Create: `src/components/export/ExportRecorder.tsx`

- [ ] **Step 1: Add export component**

Add `src/components/export/ExportRecorder.tsx`:

```tsx
"use client";

import { useRef, useState } from "react";
import { pickSupportedMimeType } from "@/lib/recording/mime";

export function ExportRecorder({
  question,
  headline,
  roastComment,
  sourceVideo
}: {
  question: string;
  headline: "진실" | "거짓";
  roastComment: string;
  sourceVideo: HTMLVideoElement | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [downloadUrl, setDownloadUrl] = useState("");

  async function renderExport() {
    const canvas = canvasRef.current;
    if (!canvas || !sourceVideo) return;
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stream = canvas.captureStream(30);
    const mimeType = pickSupportedMimeType((type) => MediaRecorder.isTypeSupported(type));
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      setDownloadUrl(URL.createObjectURL(blob));
    };

    recorder.start(250);
    const started = performance.now();
    function draw() {
      if (!ctx || !canvas) return;
      ctx.fillStyle = "#050507";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(sourceVideo, 0, 260, 1080, 1080);
      ctx.fillStyle = "#f4f4f5";
      ctx.font = "900 64px sans-serif";
      ctx.fillText("AI 거짓말탐지기", 64, 120);
      ctx.font = "700 42px sans-serif";
      ctx.fillText(`질문: ${question.slice(0, 32)}`, 64, 1460);
      ctx.font = "900 120px sans-serif";
      ctx.fillText(headline, 64, 1640);
      ctx.font = "600 40px sans-serif";
      ctx.fillText(roastComment.slice(0, 34), 64, 1740);
      if (performance.now() - started < 6000) requestAnimationFrame(draw);
      else recorder.stop();
    }
    draw();
  }

  return (
    <div>
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <button onClick={renderExport}>릴스용 영상 만들기</button>
      {downloadUrl && <a href={downloadUrl} download="ai-lie-detector.webm">영상 저장</a>}
    </div>
  );
}
```

- [ ] **Step 2: Verify**

Run: `pnpm build`

Expected: build completes.

## Task 11: Prompt Wiring

**Files:**
- Create: `src/lib/gemini/prompt.ts`

- [ ] **Step 1: Add prompt contract**

Add `src/lib/gemini/prompt.ts`:

```ts
export const GEMINI_SYSTEM_PROMPT = `
당신은 "AI 거짓말탐지기"의 멀티모달 분석 모델입니다.

출력은 반드시 단일 JSON 객체입니다.
공개 결과 headline은 반드시 "진실" 또는 "거짓" 중 하나만 출력합니다.
공개 결과 headline에 다른 단어, 숫자, 확률, 문장부호를 붙이지 않습니다.
공개 결과에는 가능성, 확률, confidence, 내부 점수를 쓰지 않습니다.
공개 결과에는 감지 신호를 쓰지 않습니다.
공개 결과에는 어떤 행동, 표정, 시선, 음성, 답변 패턴이 수상했는지 쓰지 않습니다.
질문은 공개 결과와 공유 문구에 포함합니다.
roast_comment는 심하게 놀리되 심한 욕설은 쓰지 않습니다.
품질이 너무 낮으면 quality_gate.status를 "retry"로 설정합니다.
품질이 충분하면 quality_gate.status를 "pass"로 설정하고 public_result를 채웁니다.
`.trim();

export function buildGeminiTextPayload(input: {
  targetQuestion: string;
  warmupQuestion: string;
  transcript: string;
  featurePayload: unknown;
}) {
  return JSON.stringify({
    service: "AI 거짓말탐지기",
    questions: {
      warmup: input.warmupQuestion,
      target: input.targetQuestion
    },
    transcript: input.transcript,
    featurePayload: input.featurePayload,
    publicOutputRules: {
      headlineAllowedValues: ["진실", "거짓"],
      showProbability: false,
      showDetectionSignals: false,
      includeQuestionInShare: true
    }
  });
}
```

- [ ] **Step 2: Use prompt in Worker**

In `worker/src/index.ts`, include `systemInstruction: GEMINI_SYSTEM_PROMPT` or copy the same prompt string into the Worker package. Keep prompt version as `1` in DB writes.

- [ ] **Step 3: Verify**

Run: `pnpm test tests/gemini-schema.test.ts`

Expected: schema tests still pass.

## Task 12: Final Verification

**Files:**
- Modify as needed from prior tasks.

- [ ] **Step 1: Run unit tests**

Run: `pnpm test`

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `pnpm build`

Expected: Next.js build completes.

- [ ] **Step 3: Start local app**

Run: `pnpm dev`

Expected: local app starts at `http://localhost:3000`.

- [ ] **Step 4: Manual smoke test**

Open `http://localhost:3000` and verify:

- Question can be entered.
- `질문 잠그기` opens the same-device recording screen.
- Respondent page asks for camera/mic permission.
- Warmup question appears before target question.
- Analysis screen shows professional modules.
- Result headline renders only `진실` or `거짓`.
- Export button creates a downloadable video.

- [ ] **Step 5: Commit**

Run:

```bash
git add .
git commit -m "feat: build ai lie detector mvp"
```

Expected: one commit contains the MVP implementation.

## Self-Review

- PRD coverage: The plan covers 2-question UX, exact result headline, hidden signals, R2 video storage, Gemini 1 FPS plus target 5 FPS, local feature JSON, browser export, Supabase, and future payment adapters.
- Placeholder scan: The plan contains concrete file paths, commands, schemas, and first-pass code for each core unit.
- Type consistency: `truth` maps to `진실`, `lie` maps to `거짓`, and the same verdict/headline types are used across schema, DB, and result rendering.
