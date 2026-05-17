# Final Non-UI Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the non-UI MVP path so a recorded answer can be uploaded, queued for Gemini analysis, stored, and exported with deploy/auth setup documented.

**Architecture:** Keep UI styling out of scope. Add a server-side Worker trigger after R2 upload completion, replace placeholder feature JSON with browser-observable video/audio samples, wire Kakao login through Supabase Auth, and document the credentials the owner must authenticate before deployment.

**Tech Stack:** Next.js App Router, TypeScript, Supabase, Cloudflare Worker/R2, Gemini, MediaRecorder, MediaPipe Face Landmarker, Vitest.

---

### Task 1: Worker Trigger

**Files:**
- Create: `src/lib/analysis/trigger.ts`
- Modify: `src/app/api/sessions/[id]/complete-upload/route.ts`
- Test: `tests/analysis-trigger.test.ts`

- [ ] Add a pure URL normalizer and a `triggerAnalysis(sessionId)` function that POSTs to `ANALYSIS_WORKER_URL` with `Authorization: Bearer ${WORKER_SHARED_SECRET}`.
- [ ] Return a structured result for queued, disabled, and failed trigger states.
- [ ] Call the trigger after `complete_session_upload`; fail the API if Worker credentials are missing or Worker queueing fails, so users do not wait on a job that never started.
- [ ] Verify with a failing test first, then implement.

### Task 2: Browser Feature Payload

**Files:**
- Modify: `src/lib/recording/features.ts`
- Modify: `src/hooks/useFeatureCollector.ts`
- Modify: `src/app/s/[id]/SessionRecorder.tsx`
- Test: `tests/recording-hooks.test.ts`

- [ ] Add feature sample aggregation for video brightness, frame motion, audio energy, pitch variance, pause ratio, speech latency, weak rPPG proxy, and optional MediaPipe face/blendshape samples.
- [ ] Start sampling when recording starts and stop sampling when the target answer ends.
- [ ] Preserve graceful fallback: if MediaPipe fails, still submit partial video/audio features.
- [ ] Verify aggregation with deterministic unit tests.

### Task 3: Kakao/Supabase Auth Boundary

**Files:**
- Add dependency: `@supabase/ssr`
- Create: `src/lib/supabase/auth-server.ts`
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/auth/kakao.ts`
- Create: `src/app/auth/callback/route.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/api/sessions/route.ts`

- [ ] Add browser OAuth login for Kakao through Supabase.
- [ ] Add OAuth callback route that exchanges the code and stores Supabase cookies.
- [ ] Attach authenticated `user_id` and Kakao provider id to newly created sessions when the user is logged in.
- [ ] Keep device id fallback for local MVP use.

### Task 4: Deployment/Auth Checklist

**Files:**
- Create: `docs/DEPLOYMENT_AUTH_CHECKLIST.md`
- Modify: `docs/TECHNICAL_SPEC.md`

- [ ] List every required owner action: Supabase project/env keys/migration, Kakao provider setup, Cloudflare R2/Worker secrets, Gemini API key, Vercel env vars.
- [ ] Include exact env var names used by the code.
- [ ] Note that UI can be redesigned separately without changing the API/Worker contract.

### Task 5: Verification

**Commands:**
- `pnpm exec tsc --noEmit`
- `pnpm exec tsc -p worker/tsconfig.json --noEmit`
- `pnpm test`
- `pnpm build`

- [ ] Run all commands fresh.
- [ ] Report any remaining external-auth actions that cannot be completed without the owner's browser/account access.
