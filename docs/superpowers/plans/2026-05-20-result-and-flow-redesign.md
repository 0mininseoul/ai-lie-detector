# Result & Flow Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 답변 영상을 결과 페이지의 중심으로 끌어올리고, /s/[id]의 analyzing phase를 제거해 답변 종료 즉시 /result/[id]에서 영상이 재생되며 분석을 기다리도록 한다.

**Architecture:**
- 영상은 이미 R2에 업로드되고 있음 (`recordings.r2_key`). 새 컬럼 불필요.
- 워커에 GET 엔드포인트만 추가해서 누구나 영상을 시청 가능하게 한다 (worker가 R2를 streaming proxy).
- `/s/[id]`는 답변 후 곧장 `router.replace('/result/[id]')`. 분석 폴링은 `/result/[id]`로 이전.
- 본인은 메모리에 보존한 Blob으로 즉시 재생, 외부인/새로고침 시 R2 스트리밍으로 폴백.

**Tech Stack:** Next.js 16, React 19, Cloudflare Workers, R2, Supabase, MediaRecorder API.

---

## File Structure

### New files
- `worker/src/index.ts` (modify) — add `GET /recording/:sessionId`
- `src/lib/recording/local-store.ts` — module-level Map<sessionId, Blob>
- `src/lib/sessions/video-url.ts` — `recordingDownloadUrl(sessionId)` helper
- `src/app/result/[id]/ResultExperience.tsx` — client component (video + polling + states)
- `src/app/result/[id]/ResultExperience.module.css`
- `src/components/export/ReelsComposer.tsx` — replaces ExportRecorder

### Modified files
- `src/app/s/[id]/SessionRecorder.tsx` — drop analyzing phase, store blob locally
- `src/app/result/[id]/page.tsx` — server shell only; renders ResultExperience
- `src/app/result/[id]/result.module.css` — full-bleed shell
- `src/app/result/[id]/ResultActions.tsx` — floating CTA bar

### Deleted files
- `src/components/export/ExportRecorder.tsx`
- `src/components/export/ExportRecorder.module.css`

---

### Task 1: Worker recording download endpoint

**Files:**
- Modify: `worker/src/index.ts`

Add a route that streams the analysed recording back from R2 for any caller. The session UUID itself is the access token; without it nobody can derive the key.

- [ ] **Step 1: Add route handler at the top of the `fetch` function**

In `worker/src/index.ts` inside the `fetch` handler, add after the `/upload` block:

```ts
if (request.method === "GET" && url.pathname.startsWith("/recording/")) {
  return handleRecordingDownload(request, env, url);
}
```

- [ ] **Step 2: Implement `handleRecordingDownload`**

Add this function near `handleUpload`:

```ts
async function handleRecordingDownload(request: Request, env: Env, url: URL) {
  const sessionId = url.pathname.slice("/recording/".length);
  if (!isUuid(sessionId)) {
    return Response.json({ error: "Invalid session id" }, { status: 400, headers: downloadCorsHeaders(request) });
  }

  const supabase = createSupabase(env);
  const { data: recording, error } = await supabase
    .from("recordings")
    .select("r2_key, mime_type")
    .eq("session_id", sessionId)
    .maybeSingle<{ r2_key: string; mime_type: string }>();

  if (error || !recording) {
    return Response.json({ error: "Recording not ready" }, { status: 404, headers: downloadCorsHeaders(request) });
  }

  const object = await env.RECORDINGS.get(recording.r2_key);
  if (!object) {
    return Response.json({ error: "R2 object missing" }, { status: 404, headers: downloadCorsHeaders(request) });
  }

  return new Response(object.body as ReadableStream, {
    headers: {
      ...Object.fromEntries(downloadCorsHeaders(request)),
      "content-type": recording.mime_type,
      "cache-control": "private, max-age=3600",
    },
  });
}

function downloadCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  const headers = new Headers({
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "300",
  });
  if (isAllowedUploadOrigin(origin)) {
    headers.set("access-control-allow-origin", origin);
    headers.set("vary", "Origin");
  }
  return headers;
}
```

- [ ] **Step 3: Update the `R2Bucket` type to expose `.body`**

```ts
type R2ObjectBody = {
  arrayBuffer(): Promise<ArrayBuffer>;
  body: ReadableStream;
};
```

- [ ] **Step 4: Commit**

```bash
git add worker/src/index.ts
git commit -m "feat(worker): add /recording/:sessionId streaming endpoint"
```

---

### Task 2: Recording local-store module

**Files:**
- Create: `src/lib/recording/local-store.ts`

In-memory Map keyed by sessionId. Survives SPA navigation; sessionStorage cannot hold Blob.

- [ ] **Step 1: Write the module**

```ts
// src/lib/recording/local-store.ts
const blobs = new Map<string, Blob>();
const urls = new Map<string, string>();

export const recordingLocalStore = {
  set(sessionId: string, blob: Blob): void {
    blobs.set(sessionId, blob);
  },
  get(sessionId: string): Blob | undefined {
    return blobs.get(sessionId);
  },
  toUrl(sessionId: string): string | undefined {
    const cached = urls.get(sessionId);
    if (cached) return cached;
    const blob = blobs.get(sessionId);
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    urls.set(sessionId, url);
    return url;
  },
  clear(sessionId: string): void {
    const url = urls.get(sessionId);
    if (url) URL.revokeObjectURL(url);
    urls.delete(sessionId);
    blobs.delete(sessionId);
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/recording/local-store.ts
git commit -m "feat: add in-memory recording local-store"
```

---

### Task 3: SessionRecorder skips analyzing phase

**Files:**
- Modify: `src/app/s/[id]/SessionRecorder.tsx`

The session page no longer polls or shows the ProfessionalOverlay loading screen. It uploads, triggers analysis, stores the blob locally, and navigates to /result/[id].

- [ ] **Step 1: Add imports**

```ts
import { recordingLocalStore } from "@/lib/recording/local-store";
```

- [ ] **Step 2: Inside `finishTarget`, replace the success branch**

After `complete-upload` succeeds, replace `setPhase("analyzing")` with:

```ts
recordingLocalStore.set(session.id, recording.blob);
// Fire-and-forget the analyze trigger; /result/[id] polls status from here on.
void fetch(`/api/sessions/${session.id}/analyze`, { method: "POST" }).catch(() => undefined);
router.replace(`/result/${session.id}`);
return;
```

- [ ] **Step 3: Remove the analyzing-phase polling effect entirely**

Delete the entire `useEffect` block that runs when `phase === "analyzing"` (the one starting `let cancelled = false; let failures = 0; const startedAt = Date.now();` and ending at the closing `}, [phase, router, session.id]);`).

- [ ] **Step 4: Remove the "complete → router.replace" effect**

Delete:
```ts
useEffect(() => {
  if (phase === "complete") {
    router.replace(`/result/${session.id}`);
  }
}, [phase, router, session.id]);
```

- [ ] **Step 5: Remove the analyzing-phase JSX overlay**

In the JSX, delete `{phase === "analyzing" ? <ProfessionalOverlay /> : null}` and the LiveAnalysisHud's `|| phase === "analyzing"` condition.

- [ ] **Step 6: Remove `analyzing` and `complete` from `FlowPhase`**

```ts
type FlowPhase = "setup" | "warmup" | "between" | "target" | "error";
```

Update `getInitialPhase` accordingly:
```ts
function getInitialPhase(status: string): FlowPhase {
  if (status === "failed" || status === "expired") return "error";
  return "setup";
}
```

- [ ] **Step 7: Remove unused imports**

Remove `ProfessionalOverlay` import if no longer referenced.

- [ ] **Step 8: Smoke-check the page compiles**

```bash
pnpm exec tsc --noEmit
```

Expected: 0 errors (or errors only in unrelated files).

- [ ] **Step 9: Commit**

```bash
git add src/app/s/[id]/SessionRecorder.tsx
git commit -m "feat(session): jump straight to result page after upload"
```

---

### Task 4: Result page becomes a thin server shell

**Files:**
- Modify: `src/app/result/[id]/page.tsx`

Server component fetches the bare minimum (`target_question`); the client component owns video src, polling, overlay states, animations.

- [ ] **Step 1: Rewrite `page.tsx`**

```tsx
import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ResultExperience } from "./ResultExperience";

export const dynamic = "force-dynamic";

type ResultPageProps = {
  params: Promise<{ id: string }>;
};

type SessionRecord = {
  id: string;
  target_question: string;
};

export default async function ResultPage({ params }: ResultPageProps) {
  const { id } = await params;
  const supabase = getSupabaseServer();
  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, target_question")
    .eq("id", id)
    .single<SessionRecord>();

  if (error || !session) {
    notFound();
  }

  return <ResultExperience sessionId={session.id} question={session.target_question} />;
}
```

- [ ] **Step 2: Commit (after Task 5 lands the new component)**

(Combined commit at end of Task 5.)

---

### Task 5: ResultExperience client component

**Files:**
- Create: `src/app/result/[id]/ResultExperience.tsx`
- Create: `src/app/result/[id]/ResultExperience.module.css`
- Modify: `src/app/result/[id]/result.module.css` (full-bleed shell)

Owns: video element, src selection (local → r2), polling, three overlay states, unmute toggle, primary CTA bar wiring.

- [ ] **Step 1: Write `ResultExperience.tsx`** (see code below — large file, full implementation)

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Volume2, VolumeX } from "lucide-react";
import { recordingLocalStore } from "@/lib/recording/local-store";
import { recordingDownloadUrl } from "@/lib/sessions/video-url";
import { ResultActions } from "./ResultActions";
import type { Headline } from "@/types/domain";
import styles from "./ResultExperience.module.css";

type Status = "pending" | "revealed" | "failed";
type StatusResponse = {
  status: string;
  errorCode?: string | null;
  errorDetail?: string | null;
  result: null | {
    verdict: string;
    headline: Headline;
    roastComment: string;
    public: { share_text?: string } | null;
  };
};

type Props = {
  sessionId: string;
  question: string;
};

const pollIntervalMs = 1500;
const maxPollMs = 60_000;

export function ResultExperience({ sessionId, question }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("pending");
  const [result, setResult] = useState<StatusResponse["result"]>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);

  // Resolve video src: local blob (own session) or R2 streaming URL.
  useEffect(() => {
    const local = recordingLocalStore.toUrl(sessionId);
    if (local) {
      setVideoSrc(local);
      return;
    }
    setVideoSrc(recordingDownloadUrl(sessionId));
  }, [sessionId]);

  // Poll for analysis result.
  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();

    const tick = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(`/api/sessions/${sessionId}/status`, { cache: "no-store" });
        if (!response.ok) return;
        const data = (await response.json()) as StatusResponse;
        if (cancelled) return;

        if (data.status === "complete" && data.result) {
          setResult(data.result);
          setStatus("revealed");
          setRevealing(true);
          window.setTimeout(() => setRevealing(false), 1400);
          return true;
        }
        if (data.status === "failed" || data.status === "expired") {
          setErrorDetail(data.errorDetail ?? data.errorCode ?? null);
          setStatus("failed");
          return true;
        }
        if (Date.now() - startedAt > maxPollMs) {
          setStatus("failed");
          setErrorDetail("분석 응답이 너무 오래 걸려서 중단했습니다.");
          return true;
        }
      } catch {}
      return false;
    };

    let timer: number | undefined;
    const loop = async () => {
      const done = await tick();
      if (done || cancelled) return;
      timer = window.setTimeout(loop, pollIntervalMs);
    };
    void loop();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [sessionId]);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
  }, [muted]);

  const headline = result?.headline ?? null;
  const roast = result?.roastComment ?? "";
  const shareText = useMemo(() => {
    if (result?.public?.share_text) return result.public.share_text;
    if (headline) return `질문: ${question} / 판정: ${headline} / ${roast}`;
    return `질문: ${question}`;
  }, [headline, question, result, roast]);

  return (
    <main className={styles.shell}>
      <div className={styles.stage} data-status={status} data-revealing={revealing}>
        <video
          ref={videoRef}
          className={styles.video}
          src={videoSrc ?? undefined}
          autoPlay
          muted={muted}
          loop
          playsInline
          preload="auto"
          crossOrigin="anonymous"
        />

        <button
          type="button"
          className={styles.muteButton}
          onClick={toggleMute}
          aria-label={muted ? "소리 켜기" : "소리 끄기"}
        >
          {muted ? <VolumeX size={18} aria-hidden /> : <Volume2 size={18} aria-hidden />}
          <span>{muted ? "소리 켜기" : "소리 끄기"}</span>
        </button>

        <header className={styles.topMeta}>
          <span className={styles.brand}>AI 거짓말탐지기</span>
          <p className={styles.question}>{question}</p>
        </header>

        {status === "pending" ? <AnalyzingOverlay /> : null}

        {status === "revealed" && headline ? (
          <div className={styles.verdictLayer}>
            <h1 className={styles.headline} data-verdict={headline}>{headline}</h1>
            <p className={styles.roast}>{roast}</p>
          </div>
        ) : null}

        {status === "failed" ? (
          <FailedOverlay
            errorDetail={errorDetail}
            onRetry={() => router.replace("/new")}
            sessionId={sessionId}
          />
        ) : null}

        <ResultActions
          sessionId={sessionId}
          question={question}
          videoSrc={videoSrc}
          headline={headline}
          roastComment={roast}
          shareText={shareText}
          disabled={status !== "revealed"}
        />
      </div>
    </main>
  );
}

function AnalyzingOverlay() {
  return (
    <div className={styles.analyzingLayer} aria-live="polite">
      <span className={styles.scanline} aria-hidden />
      <div className={styles.analyzingCard}>
        <span className={styles.analyzingKicker}>ANALYZING</span>
        <div className={styles.bars}>
          <i style={{ animationDelay: "0ms" }} />
          <i style={{ animationDelay: "120ms" }} />
          <i style={{ animationDelay: "240ms" }} />
          <i style={{ animationDelay: "360ms" }} />
          <i style={{ animationDelay: "480ms" }} />
        </div>
        <p className={styles.analyzingLog}>
          표정 · 시선 · 음성 · 지연 패턴을 교차 검증하고 있어요.
        </p>
      </div>
    </div>
  );
}

function FailedOverlay({
  errorDetail,
  onRetry,
  sessionId,
}: {
  errorDetail: string | null;
  onRetry: () => void;
  sessionId: string;
}) {
  useEffect(() => {
    void fetch(`/api/sessions/${sessionId}/refund-trial`, { method: "POST" }).catch(() => undefined);
  }, [sessionId]);

  return (
    <div className={styles.failedLayer} role="dialog" aria-modal="true">
      <div className={styles.failedCard}>
        <h2>죄송합니다.</h2>
        <p>분석 중에 문제가 발생했어요. 사과의 의미로 무료 체험권 1회를 추가로 드릴게요.</p>
        {errorDetail ? <p className={styles.failedDetail}>{errorDetail}</p> : null}
        <button type="button" onClick={onRetry}>새 질문 만들기</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `ResultExperience.module.css`**

```css
.shell {
  position: fixed;
  inset: 0;
  background: var(--page-bg, #060a10);
  color: var(--fg, #f5f7fb);
  display: grid;
  place-items: center;
  overflow: hidden;
}

.stage {
  position: relative;
  width: 100%;
  height: 100%;
  max-width: min(100vw, calc(100dvh * 9 / 16));
  background: #000;
  overflow: hidden;
}

.video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  background: #000;
}

.muteButton {
  position: absolute;
  top: 14px;
  left: 14px;
  z-index: 30;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border: 1px solid oklch(74% 0.16 158 / 0.45);
  border-radius: 999px;
  background: oklch(8% 0.018 230 / 0.55);
  backdrop-filter: blur(12px) saturate(1.4);
  color: oklch(94% 0.04 158);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.muteButton:hover { background: oklch(8% 0.018 230 / 0.7); }

.topMeta {
  position: absolute;
  top: 14px;
  right: 14px;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  max-width: 60%;
}
.brand {
  font-size: 10px;
  letter-spacing: 0.18em;
  color: oklch(82% 0.16 158);
  font-weight: 700;
}
.question {
  margin: 0;
  padding: 8px 12px;
  border-radius: 8px;
  background: oklch(8% 0.018 230 / 0.55);
  backdrop-filter: blur(12px) saturate(1.4);
  color: oklch(96% 0.02 158);
  font-size: 13px;
  text-align: right;
  font-weight: 600;
  line-height: 1.4;
}

.analyzingLayer {
  position: absolute;
  inset: 0;
  z-index: 15;
  pointer-events: none;
  display: grid;
  place-items: center;
}
.scanline {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, transparent 0%, oklch(74% 0.16 158 / 0.18) 50%, transparent 100%);
  background-size: 100% 30%;
  background-repeat: no-repeat;
  animation: scan 2.4s linear infinite;
}
@keyframes scan { 0% { background-position: 0 -50%; } 100% { background-position: 0 150%; } }

.analyzingCard {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 22px;
  border: 1px solid oklch(74% 0.16 158 / 0.4);
  border-radius: 14px;
  background: oklch(6% 0.014 230 / 0.62);
  backdrop-filter: blur(20px) saturate(1.6);
  text-align: center;
  max-width: 84%;
}
.analyzingKicker {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.22em;
  color: oklch(82% 0.16 158);
}
.bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 4px;
  height: 28px;
}
.bars i {
  width: 4px;
  background: linear-gradient(180deg, oklch(82% 0.16 158), oklch(60% 0.14 230));
  border-radius: 2px;
  animation: bar 920ms ease-in-out infinite alternate;
  height: 28%;
}
@keyframes bar { to { height: 100%; } }
.analyzingLog {
  margin: 0;
  font-size: 11px;
  color: oklch(86% 0.04 158 / 0.85);
  letter-spacing: 0.04em;
}

.verdictLayer {
  position: absolute;
  inset: 0;
  z-index: 18;
  display: grid;
  align-items: center;
  justify-items: center;
  padding: 0 24px;
  pointer-events: none;
}
.headline {
  margin: 0;
  font-size: clamp(96px, 28vw, 220px);
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 0.9;
  text-shadow:
    0 0 24px oklch(8% 0.018 230 / 0.6),
    0 4px 80px oklch(6% 0.014 230 / 0.4);
  animation: slamIn 700ms cubic-bezier(0.16, 1.2, 0.3, 1) backwards;
}
.headline[data-verdict="거짓"] { color: oklch(70% 0.22 25); }
.headline[data-verdict="진실"] { color: oklch(78% 0.18 158); }
.roast {
  position: absolute;
  bottom: 22%;
  left: 0;
  right: 0;
  text-align: center;
  margin: 0;
  padding: 0 32px;
  font-size: clamp(16px, 4.4vw, 22px);
  font-weight: 700;
  line-height: 1.4;
  color: oklch(96% 0.02 158);
  text-shadow: 0 2px 12px oklch(6% 0.014 230 / 0.8);
  animation: fadeUp 600ms ease 350ms backwards;
}
@keyframes slamIn {
  0% { transform: scale(2.2) rotate(-3deg); opacity: 0; filter: blur(20px); }
  60% { transform: scale(0.95) rotate(0); opacity: 1; filter: blur(0); }
  100% { transform: scale(1); }
}
@keyframes fadeUp {
  0% { transform: translateY(20px); opacity: 0; }
  100% { transform: translateY(0); opacity: 1; }
}

.failedLayer {
  position: absolute;
  inset: 0;
  z-index: 40;
  display: grid;
  place-items: center;
  background: oklch(4% 0.012 230 / 0.78);
  backdrop-filter: blur(12px);
}
.failedCard {
  max-width: 320px;
  padding: 28px 24px;
  border-radius: 18px;
  background: oklch(10% 0.02 230);
  border: 1px solid oklch(74% 0.16 158 / 0.32);
  text-align: center;
}
.failedCard h2 { margin: 0 0 8px; font-size: 22px; font-weight: 900; }
.failedCard p { margin: 0 0 10px; font-size: 14px; line-height: 1.5; color: oklch(88% 0.02 158 / 0.9); }
.failedDetail { font-size: 11px; color: oklch(68% 0.02 158 / 0.7); }
.failedCard button {
  margin-top: 14px;
  padding: 10px 18px;
  border: 0;
  border-radius: 999px;
  background: oklch(74% 0.16 158);
  color: oklch(8% 0.02 158);
  font-weight: 800;
  cursor: pointer;
}
```

- [ ] **Step 3: Update `result.module.css`** to be a no-op placeholder (the old page.tsx style is no longer needed; ResultExperience styles itself).

Empty the file, or delete unused selectors. Keep only an empty file (some imports may still expect it).

- [ ] **Step 4: Commit**

```bash
git add src/app/result/
git commit -m "feat(result): immersive full-bleed video result page"
```

---

### Task 6: Video URL helper

**Files:**
- Create: `src/lib/sessions/video-url.ts`

- [ ] **Step 1: Write the helper**

```ts
// src/lib/sessions/video-url.ts
function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function recordingDownloadUrl(sessionId: string): string {
  const base = trimTrailingSlash(
    process.env.NEXT_PUBLIC_ANALYSIS_WORKER_URL?.trim() ||
      process.env.NEXT_PUBLIC_WORKER_URL?.trim() ||
      ""
  );
  if (!base) {
    return "";
  }
  return `${base}/recording/${sessionId}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/sessions/video-url.ts
git commit -m "feat: client helper for worker recording URL"
```

---

### Task 7: ResultActions rewrite

**Files:**
- Modify: `src/app/result/[id]/ResultActions.tsx`

Floating bottom bar. Primary share, secondary 릴스 다운로드 + 새 질문.

- [ ] **Step 1: Rewrite**

```tsx
"use client";

import { Plus, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { Headline } from "@/types/domain";
import styles from "./ResultExperience.module.css";

const ReelsComposer = dynamic(
  () => import("@/components/export/ReelsComposer").then((m) => m.ReelsComposer),
  { ssr: false }
);

type Props = {
  sessionId: string;
  question: string;
  videoSrc: string | null;
  headline: Headline | null;
  roastComment: string;
  shareText: string;
  disabled: boolean;
};

export function ResultActions({ sessionId, question, videoSrc, headline, roastComment, shareText, disabled }: Props) {
  const router = useRouter();
  const [toast, setToast] = useState("");

  async function share() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "AI 거짓말탐지기", text: shareText, url: window.location.href });
        return;
      }
      await navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
      setToast("공유 문구를 복사했습니다.");
      window.setTimeout(() => setToast(""), 1800);
    } catch {
      setToast("공유가 막혔어요. 다시 눌러 주세요.");
      window.setTimeout(() => setToast(""), 1800);
    }
  }

  return (
    <div className={styles.actionBar} data-disabled={disabled} aria-hidden={disabled}>
      <button type="button" onClick={share} className={styles.primaryAction} disabled={disabled}>
        <Share2 size={18} aria-hidden />
        공유하기
      </button>
      {headline && videoSrc ? (
        <ReelsComposer
          videoSrc={videoSrc}
          question={question}
          headline={headline}
          roastComment={roastComment}
        />
      ) : null}
      <button
        type="button"
        onClick={() => router.replace("/new")}
        className={styles.secondaryAction}
      >
        <Plus size={16} aria-hidden />
        새 질문
      </button>
      {toast ? <p className={styles.toast}>{toast}</p> : null}
    </div>
  );
}
```

- [ ] **Step 2: Add styles to `ResultExperience.module.css`**

Append:
```css
.actionBar {
  position: absolute;
  bottom: 24px;
  left: 0;
  right: 0;
  z-index: 25;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 10px;
  padding: 0 20px;
  flex-wrap: wrap;
  transition: opacity 200ms ease;
}
.actionBar[data-disabled="true"] { opacity: 0.35; pointer-events: none; }

.primaryAction,
.secondaryAction {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 1px solid oklch(74% 0.16 158 / 0.5);
  border-radius: 999px;
  padding: 12px 18px;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
  backdrop-filter: blur(14px) saturate(1.5);
}
.primaryAction {
  background: oklch(74% 0.16 158);
  color: oklch(10% 0.02 158);
  border-color: transparent;
  box-shadow: 0 12px 32px oklch(74% 0.16 158 / 0.35);
}
.primaryAction:hover { transform: translateY(-1px); }
.secondaryAction {
  background: oklch(8% 0.018 230 / 0.6);
  color: oklch(94% 0.04 158);
}
.toast {
  position: absolute;
  bottom: 78px;
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 8px 14px;
  background: oklch(8% 0.018 230 / 0.85);
  color: oklch(96% 0.02 158);
  font-size: 12px;
  border-radius: 999px;
  border: 1px solid oklch(74% 0.16 158 / 0.4);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/result/
git commit -m "feat(result): floating share-first action bar"
```

---

### Task 8: ReelsComposer — composite real video + overlay

**Files:**
- Create: `src/components/export/ReelsComposer.tsx`
- Create: `src/components/export/ReelsComposer.module.css`

Loads the actual video, paints it onto a 1080×1920 canvas while drawing overlays, captures canvas+audio stream into a webm.

- [ ] **Step 1: Write the component**

```tsx
"use client";

import { Download, Film, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pickSupportedMimeType } from "@/lib/recording/mime";
import type { Headline } from "@/types/domain";
import styles from "./ReelsComposer.module.css";

type Props = {
  videoSrc: string;
  question: string;
  headline: Headline;
  roastComment: string;
};

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const REVEAL_HOLD_MS = 1800;

export function ReelsComposer({ videoSrc, question, headline, roastComment }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<"idle" | "rendering" | "ready" | "error">("idle");
  const [downloadUrl, setDownloadUrl] = useState("");
  const urlRef = useRef("");

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function start() {
    if (status === "rendering") return;
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (typeof (video as unknown as { captureStream?: () => MediaStream }).captureStream !== "function") {
      // Fallback: trigger download of the raw source video.
      const a = document.createElement("a");
      a.href = videoSrc;
      a.download = "ai-lie-detector-recording.webm";
      a.click();
      return;
    }

    setStatus("rendering");
    setDownloadUrl("");
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";

    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    try {
      video.currentTime = 0;
      video.muted = false;
      await video.play();
    } catch {
      // ignored; we'll still draw frames using requestAnimationFrame
    }

    const videoStream = (video as unknown as { captureStream: () => MediaStream }).captureStream();
    const canvasStream = canvas.captureStream(30);
    videoStream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));

    const mimeType = pickSupportedMimeType((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
    const recorder = new MediaRecorder(canvasStream, { mimeType });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      const next = URL.createObjectURL(blob);
      urlRef.current = next;
      setDownloadUrl(next);
      setStatus("ready");
    };
    recorder.start(200);

    const startedAt = performance.now();
    const videoDurationMs = Math.max((video.duration || 5) * 1000, 4000);
    const totalMs = videoDurationMs + REVEAL_HOLD_MS;

    function frame(now: number) {
      const elapsed = now - startedAt;
      const progress = Math.min(1, elapsed / videoDurationMs);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

      drawCoverVideo(ctx, video);
      drawTopChrome(ctx, question);
      if (elapsed > videoDurationMs) {
        const revealProgress = Math.min(1, (elapsed - videoDurationMs) / 800);
        drawVerdict(ctx, headline, roastComment, revealProgress);
      }

      if (elapsed < totalMs) {
        requestAnimationFrame(frame);
      } else {
        if (recorder.state !== "inactive") recorder.stop();
        video.pause();
      }
    }
    requestAnimationFrame(frame);
  }

  return (
    <div className={styles.composer}>
      <canvas ref={canvasRef} aria-hidden className={styles.canvas} />
      <video
        ref={videoRef}
        src={videoSrc}
        playsInline
        crossOrigin="anonymous"
        className={styles.hiddenVideo}
        muted={false}
        preload="auto"
        aria-hidden
      />
      {downloadUrl ? (
        <a href={downloadUrl} download="ai-lie-detector-reels.webm" className={styles.button}>
          <Download size={16} aria-hidden /> 영상 저장
        </a>
      ) : (
        <button type="button" onClick={start} disabled={status === "rendering"} className={styles.button}>
          {status === "rendering" ? <Loader2 size={16} aria-hidden className={styles.spin} /> : <Film size={16} aria-hidden />}
          {status === "rendering" ? "영상 만드는 중" : "릴스 영상"}
        </button>
      )}
    </div>
  );
}

function drawCoverVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement) {
  const vw = video.videoWidth || CANVAS_W;
  const vh = video.videoHeight || CANVAS_H;
  const scale = Math.max(CANVAS_W / vw, CANVAS_H / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (CANVAS_W - dw) / 2;
  const dy = (CANVAS_H - dh) / 2;
  ctx.drawImage(video, dx, dy, dw, dh);
}

function drawTopChrome(ctx: CanvasRenderingContext2D, question: string) {
  // brand
  ctx.fillStyle = "rgba(7, 11, 16, 0.55)";
  ctx.fillRect(0, 0, CANVAS_W, 220);
  ctx.fillStyle = "#9af2c8";
  ctx.font = "700 26px Pretendard, system-ui, sans-serif";
  ctx.fillText("AI 거짓말탐지기", 64, 80);
  // question card
  ctx.fillStyle = "rgba(7, 11, 16, 0.7)";
  ctx.fillRect(48, 110, CANVAS_W - 96, 96);
  ctx.fillStyle = "#f4f7fb";
  ctx.font = "800 34px Pretendard, system-ui, sans-serif";
  wrap(ctx, question, 72, 158, CANVAS_W - 144, 44, 2);
}

function drawVerdict(ctx: CanvasRenderingContext2D, headline: Headline, roast: string, t: number) {
  const eased = 1 - Math.pow(1 - t, 3);
  ctx.save();
  ctx.globalAlpha = eased;
  ctx.fillStyle = "rgba(7, 11, 16, 0.55)";
  ctx.fillRect(0, CANVAS_H * 0.32, CANVAS_W, CANVAS_H * 0.5);
  ctx.font = "900 280px Pretendard, system-ui, sans-serif";
  ctx.fillStyle = headline === "거짓" ? "#ff6b48" : "#72e3ad";
  ctx.textAlign = "center";
  ctx.fillText(headline, CANVAS_W / 2, CANVAS_H * 0.58);
  ctx.textAlign = "left";
  ctx.font = "700 40px Pretendard, system-ui, sans-serif";
  ctx.fillStyle = "#f4f7fb";
  wrap(ctx, roast, 80, CANVAS_H * 0.78, CANVAS_W - 160, 54, 3);
  ctx.font = "600 24px Pretendard, system-ui, sans-serif";
  ctx.fillStyle = "rgba(244, 247, 251, 0.6)";
  ctx.fillText("ai-lie-detector.vercel.app", 80, CANVAS_H - 80);
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines: number) {
  const tokens = text.split("");
  let line = "";
  const lines: string[] = [];
  for (const ch of tokens) {
    const candidate = line + ch;
    if (ctx.measureText(candidate).width > maxW) {
      lines.push(line);
      line = ch;
      if (lines.length === maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineH));
}
```

- [ ] **Step 2: Write `ReelsComposer.module.css`**

```css
.composer { display: inline-flex; align-items: center; }
.canvas { display: none; }
.hiddenVideo { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; left: -9999px; }
.button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 12px 18px;
  border-radius: 999px;
  font-weight: 800;
  font-size: 14px;
  text-decoration: none;
  background: oklch(8% 0.018 230 / 0.6);
  color: oklch(94% 0.04 158);
  border: 1px solid oklch(74% 0.16 158 / 0.5);
  backdrop-filter: blur(14px) saturate(1.5);
  cursor: pointer;
}
.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
```

- [ ] **Step 3: Delete `ExportRecorder.tsx` + CSS**

```bash
git rm src/components/export/ExportRecorder.tsx src/components/export/ExportRecorder.module.css
```

- [ ] **Step 4: Commit**

```bash
git add src/components/export/ReelsComposer.tsx src/components/export/ReelsComposer.module.css
git commit -m "feat(export): replace canvas-only export with video+overlay reels"
```

---

### Task 9: Verify env vars + worker URL exposure

**Files:**
- Check: `.env.local`, `.env.production`

The client needs `NEXT_PUBLIC_ANALYSIS_WORKER_URL` or `NEXT_PUBLIC_WORKER_URL` exposed.

- [ ] **Step 1: Audit existing env**

```bash
grep -E "WORKER_URL" .env.local .env.production .env 2>/dev/null
```

If only `ANALYSIS_WORKER_URL` (server-only) exists, mirror it as `NEXT_PUBLIC_ANALYSIS_WORKER_URL`.

- [ ] **Step 2: Update Vercel/Local env** to expose the public variant.

(Manual — log into Vercel dashboard or edit `.env.production`.)

---

### Task 10: Deploy + push

- [ ] **Step 1: Deploy worker**

```bash
cd worker && pnpm wrangler deploy
```

- [ ] **Step 2: Verify endpoint responds**

```bash
curl -I https://ai-lie-detector-worker.tnsb5373.workers.dev/recording/00000000-0000-0000-0000-000000000000
```

Expected: 404 with `{"error":"Recording not ready"}` (means the route is wired up).

- [ ] **Step 3: Push main**

```bash
git push origin main
```

- [ ] **Step 4: Mark task complete.**

---

## Self-review
- All spec sections mapped to tasks ✓
- No placeholders or TBDs ✓
- Type names consistent (`recordingLocalStore`, `recordingDownloadUrl`, `ResultExperience`) ✓
- Failure modes covered (FailedOverlay + refund fire-and-forget) ✓
