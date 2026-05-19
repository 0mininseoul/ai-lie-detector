# Result Page & Session Flow Redesign

**Date:** 2026-05-20
**Status:** Approved (autonomous implementation authorised by user)
**Scope:** `/s/[id]` (recording session) and `/result/[id]` (verdict & sharing), plus the reels-export pipeline.

---

## 1. Problem

The recorded video disappears as soon as Gemini finishes analysing it.
That single missing piece cascades into three visible failures:

1. The result page shows only a text headline. No proof, no replay, no shareable moment.
2. The "릴스용 영상 만들기" button outputs a fully synthesised canvas — empty grid + Korean text — because nothing in the codebase actually persists the answer footage.
3. The session is split across three screens (`target` → `analyzing` → `/result/[id]`). The user never feels they are looking at *their own answer*; the analysis screen is a dead lobby.

## 2. Goal

Make the recorded answer the centrepiece of the result. The flow becomes:

> 답변 종료 → 즉시 `/result/[id]` → 본인 영상이 풀스크린 자동재생되는 위에 ANALYZING 오버레이 → Gemini 결과 도착 시 판정 SLAM-IN → 공유.

The user spends the analysis wait *watching their own face*, which both compresses perceived latency and produces a permanent share artefact.

## 3. Confirmed Decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | UX flow | 답변+분석 화면 머지, 결과는 별도 `/result/[id]` 페이지 (Flow C) |
| 2 | Video storage | R2 자동 업로드, 공유 URL에서 영상 자동 재생 |
| 3 | Analysis wait UX | 답변 끝 즉시 `/result/[id]` push, 영상 재생 위에 ANALYZING 오버레이, 결과 도착 시 reveal |
| 4 | Audio policy | 무음 자동재생 + 좌측 상단 unmute 토글 |
| 5 | Share visibility | 누구나 영상 시청 가능 (외부 공유 = 영상 포함) |
| 6 | Primary CTA | "공유하기" (Web Share API + 카카오 fallback) |

## 4. Out of Scope

- Per-session privacy toggle (모두 public)
- 영상 편집/트리밍
- 멀티 질문 세션
- 마이페이지·세션 히스토리
- 영상 thumbnail 생성 (cover frame은 영상의 첫 프레임 사용)
- 데스크탑 전용 레이아웃 (모바일 우선, 데스크탑은 letterbox)

## 5. Architecture

```
┌─ /s/[id]  (record) ───────────────────┐    ┌─ /result/[id]  (immersive) ────────────────┐
│  MediaRecorder → 단일 Blob (video+audio) │   │  state: pending | revealed | failed         │
│  on stop:                              │    │  video src:                                 │
│    1) recordingStore.set(id, blob)     │    │     ① localBlobUrl (있으면 즉시)             │
│    2) startVideoUpload(id, blob)       │    │     ② r2SignedUrl (업로드 완료 / 외부인)      │
│    3) startAnalysis(id, blob)          │    │  audio: muted (unmute 토글)                  │
│    4) router.replace(/result/[id])     │    │  overlay:                                   │
└────────────────────────────────────────┘    │     pending  → ANALYZING 바 + 스캔라인       │
                                              │     revealed → 판정 SLAM + roast            │
                                              │     failed   → refund 모달                   │
                                              │  polling: /api/sessions/[id]/status @1.5s   │
                                              │  primary CTA: 공유하기                       │
                                              └─────────────────────────────────────────────┘
```

### Three load-bearing principles

1. **녹화 한 번, 두 용도** — 같은 청크가 (a) Gemini 분석 input, (b) R2 영상 source 양쪽으로 흘러간다. MediaRecorder 두 번 돌리지 않는다.
2. **로컬 우선, R2 fallback** — 답변자는 메모리의 Blob으로 즉시 재생, 외부인은 R2 signed URL로 본다. 본인이 보고 있는 동안 src를 swap하지 않는다 (flicker 방지).
3. **결과 페이지가 무대** — 영상이 가장 큰 element, 모든 chrome (질문/판정/CTA)은 그 위에 absolute 오버레이.

## 6. Components

### 6.1 `src/lib/recording/local-store.ts` (NEW)

```ts
const store = new Map<string, Blob>();
export const recordingStore = {
  set(id: string, blob: Blob): void,
  get(id: string): Blob | undefined,
  takeUrl(id: string): string | undefined,  // creates object URL, caller responsible for revoke
  clear(id: string): void,
};
```

이유: `sessionStorage`는 Blob을 직렬화하지 못한다. SPA 라우팅 동안 메모리는 살아있다.

### 6.2 `src/lib/recording/video-upload.ts` (NEW)

```ts
export async function uploadAnswerVideo(sessionId: string, blob: Blob): Promise<{ ok: true } | { ok: false; reason: string }>;
```

- `POST /api/sessions/[id]/video-upload-url` → presigned PUT URL을 워커로부터 받음
- PUT blob to R2 with proper content-type
- `POST /api/sessions/[id]/video-uploaded` (또는 worker가 자체 hook으로 sessions.video_key 기록)
- 실패 시 1회 재시도, 그 뒤로는 `false` 반환

### 6.3 `src/app/s/[id]/SessionRecorder.tsx` (MODIFY)

핵심 변경:
- `analyzing` phase 제거. 답변 끝 → 직접 `/result/[id]`로 `router.replace`.
- `MediaRecorder`를 single Blob 출력으로 사용 (현재는 청크 누적으로 분석 send 후 폐기). `onstop`에서 `new Blob(chunks, { type: mimeType })`.
- onstop 후 분기:
  1. `recordingStore.set(sessionId, blob)`
  2. `uploadAnswerVideo(sessionId, blob)` (await 하지 않음 — 백그라운드)
  3. 기존 `startAnalysis(sessionId, blob)` (await 하지 않음)
  4. `router.replace(/result/${sessionId})`
- countdown ring 완료 = 자동 stop trigger (이미 구현됨, 그대로 유지).
- 에러 처리: MediaRecorder 시작 실패는 그대로 `/new`로 보내고 refund. (변경 없음.)

### 6.4 `src/app/result/[id]/page.tsx` (REWRITE → Client Component)

server component로는 polling 불가. server에서 sessions row만 가져오고 client component로 verdict polling + video element 관리.

구조:
```
ResultPage (server, force-dynamic)
  └ load sessions.target_question, sessions.video_key (initial snapshot)
  └ <ResultExperience sessionId={id} question={...} initialVideoKey={...} />
```

`ResultExperience` (client) 책임:
- 영상 src 결정:
  - mount 시 `recordingStore.takeUrl(sessionId)` 시도 → localBlobUrl 있으면 그것 사용
  - 없으면 `initialVideoKey` 또는 polling에서 얻은 video_key로 `/api/sessions/[id]/video-url` 호출 → signed URL
- 영상 element: `<video autoplay muted loop playsinline>` (속성 모두 필요)
- unmute 토글: 좌측 상단 floating button, `video.muted = !video.muted`
- polling loop (1.5s):
  - `GET /api/sessions/[id]/status` → `{ headline?, roast_comment?, public_json?, video_key?, error_code?, error_detail? }`
  - 완료/실패 시 stop
- overlay phases:
  - `pending`: ANALYZING 바 + 미세 스캔라인 + 진행 로그 (페이크지만 진짜처럼)
  - `revealed`: 판정 SLAM-IN (헤드라인 큰 글씨, roast 한 줄)
  - `failed`: 기존 refund 모달 호출

### 6.5 `src/app/result/[id]/ResultActions.tsx` (REWRITE)

- 영상 위에 floating bar (mobile: bottom-anchored, desktop: bottom-center)
- Primary: 공유하기 — Web Share API 시도 → 실패하면 clipboard
- Secondary: 릴스 다운로드 (`<ReelsComposer />` trigger), 새 질문 만들기 (`router.push("/new")`)
- 모두 backdrop-filter blur 강하게 (영상 위에서도 가독성)

### 6.6 `src/components/export/ReelsComposer.tsx` (REPLACE `ExportRecorder.tsx`)

기존 `ExportRecorder`는 완전히 폐기.

```ts
function ReelsComposer({ videoSrc, question, headline, roastComment }: Props) {
  // 1. hidden <video> element load (crossorigin=anonymous, preload=auto)
  // 2. video.captureStream() → MediaStream (track 0 video, track 1 audio)
  // 3. canvas 9:16 (1080x1920)
  // 4. video.play() while requestAnimationFrame drawImage(video) + overlays
  // 5. canvas.captureStream(30) + audioTrack from videoStream → composite MediaStream
  // 6. MediaRecorder 7s (= video duration ~5s + 2s reveal hold)
  // 7. onstop → blob → download trigger
}
```

오버레이:
- 상단: brand `AI 거짓말탐지기`
- 중단: 질문 카드
- 하단: 답변 종료 후 2초 동안 판정 SLAM 애니메이션
- 워터마크: `ai-lie-detector.vercel.app`

Mobile Safari `captureStream` 미지원 시: 원본 R2 영상 직접 다운로드로 폴백 (`<a download>`).

### 6.7 Styling

- `/result/[id]` shell: `position: fixed; inset: 0;` 풀블리드, page-bg gradient 그대로 깔되 영상이 그 위에 16:9 또는 9:16으로 배치
- 영상: `object-fit: cover; max-block-size: 100dvh; max-inline-size: min(100vw, calc(100dvh * 9 / 16));`
- 모든 chrome layer: `position: absolute`, z-index 분리 (video=0, overlay=10, CTA=20, unmute=30, modal=40)

## 7. API / Worker Changes

### Worker (`worker/src/index.ts`)
- `POST /sessions/:id/video-upload-url` (NEW)
  - 검증: 기존 worker-token 패턴 재사용 (Bearer 토큰이 sessionId와 매칭)
  - R2 presigned PUT URL 반환 (`video/{sessionId}.webm`, 15분 TTL)
- `POST /sessions/:id/video-uploaded` (NEW)
  - 영상 업로드 완료 후 클라이언트가 ping → worker가 `sessions.video_key` 업데이트, `video_uploaded_at` 기록
- `GET /sessions/:id/video-url` (NEW)
  - 누구나 호출 가능 (외부 공유 정책)
  - sessions.video_key 있을 때만 presigned GET 1시간 TTL 반환
- `POST /sessions/:id/analyze` 기존 그대로 (input은 client → worker → Gemini)

### Next.js API routes (proxy thin layer)
- `/api/sessions/[id]/video-upload-url` → worker proxy
- `/api/sessions/[id]/video-uploaded` → worker proxy
- `/api/sessions/[id]/video-url` → worker proxy
- `/api/sessions/[id]/status` → Supabase 직조회 (`sessions` + `analysis_results` join), 결과 + 영상 키 + 에러 코드 묶음 반환

## 8. Database

```sql
-- 20260520100000_sessions_video.sql
alter table sessions
  add column if not exists video_key text,
  add column if not exists video_uploaded_at timestamptz;

-- public read에는 이미 RLS open이므로 추가 정책 불필요.
-- worker는 service role 사용해서 update 가능.
```

## 9. State Machine (Result Page)

```
[mount]
  hasLocal = recordingStore.has(sessionId)
  videoSrc = hasLocal ? localBlobUrl : await fetchR2Url()
  status   = "pending"
  startPolling()

[poll tick @ 1.5s]
  s = await GET /api/sessions/[id]/status
  if s.error_code:
    status = "failed"; stopPolling(); openRefundModal()
  else if s.headline:
    result = s; status = "revealed"; stopPolling(); playSlamAnimation()
  else if !hasLocal && s.video_key && !videoSrc:
    videoSrc = await fetchR2Url()  // r2 became available

[unmute button click]
  videoRef.current.muted = false

[primary CTA click]
  navigator.share?.({ url: location.href, text: shareText }) ?? copyToClipboard()

[리얼스 다운로드 click]
  <ReelsComposer videoSrc={effective video src} ... />.compose()
  → showProgressOverlay() → download .webm

[unmount / leave]
  stopPolling(); revoke local blob URL
```

## 10. Failure Modes

| Failure | Detection | Handling |
|---------|-----------|----------|
| R2 PUT 실패 | `uploadAnswerVideo` returns `{ ok: false }` | toast "영상 보존 실패 — 영상 보존 안 됨. 결과는 정상 진행" + 본인은 로컬 blob으로 계속 재생 가능. 외부 공유 URL은 영상 없이 텍스트만 표시. |
| Gemini 분석 실패 | status API의 `error_code` 존재 | 기존 refund 모달 호출 (자유체험 1회 환불) → `/new`로 이동 |
| 영상 미업로드 + 외부인 접근 | `video_key` 없음 | placeholder card + "이 결과의 영상은 아직 준비되지 않았어요" 메시지 + 텍스트 결과만 표시 |
| MediaRecorder 미지원 | `MediaRecorder.isTypeSupported` false | `/s/[id]`에서 진입 시 차단 (기존 로직 유지) |
| captureStream 미지원 (Reels) | `typeof video.captureStream !== "function"` | 원본 R2 영상 직접 다운로드로 폴백 |
| Polling 무한 루프 | 60초 경과 시 (40 ticks) | 타임아웃 → refund flow와 동일 처리 |

## 11. Privacy & Security

- 영상은 누구나 시청 가능 정책 (확인됨)이지만 sessions URL을 모르면 접근 불가 (URL = uuid)
- R2 presigned GET URL은 1시간 TTL — 링크가 떠돌지 않게
- 카카오 로그인 안 한 외부 visitor도 시청 가능
- worker는 영상 PUT 토큰을 sessionId-bound로 발급 → 다른 사람이 다른 세션 위에 영상 덮어쓰기 불가

## 12. Testing

수동 QA 체크리스트:
1. 답변 5초 끝 → 결과 페이지까지 < 1초
2. 무음 자동재생 OK (모바일/데스크탑)
3. ANALYZING 오버레이가 SLAM 전까지 표시
4. 판정 SLAM 애니메이션 → 텍스트 가독성
5. 좌측 상단 unmute 토글로 소리 ON/OFF
6. 공유 버튼 → Web Share API 호출 or clipboard 복사
7. 릴스 다운로드 → webm 파일에 실제 유저 영상 + 오버레이 포함
8. incognito 창에서 동일 URL 열기 → 영상 자동재생 + 같은 판정
9. 새로고침 후에도 R2에서 영상 로드 (로컬 blob 사라져도)
10. Gemini 실패 시뮬레이션 → refund 모달

자동 테스트 (선택, 기존 테스트 구조 따름):
- `tests/recording-pipeline.test.ts`: SessionRecorder onstop 분기 검증
- `tests/result-status-polling.test.ts`: status polling stop 조건 검증

## 13. Rollout

- 단일 브랜치, 단일 PR (사용자 선호도 따라)
- Supabase migration `20260520100000_sessions_video.sql` 적용
- Cloudflare Worker 재배포 필요 (새 라우트 3개)
- Vercel 자동 배포 (main push)
- 검증 환경: 프로덕션 직접 (별도 staging 없음)

## 14. Open Questions

없음. 모든 결정 확정.
