# AI 거짓말탐지기 기술 설계서

## 1. 시스템 개요

AI 거짓말탐지기는 브라우저에서 카메라/마이크 입력을 받고, 로컬 feature를 추출하며, 전체 영상을 Cloudflare Worker를 통해 Cloudflare R2에 임시 저장한 뒤 Gemini에 분석 요청을 보내는 웹 서비스다.

MVP는 결제 없이 동작한다. 단, entitlement와 payment adapter를 처음부터 분리해 추후 Polar와 앱인토스 IAP를 붙일 수 있게 한다.

## 2. 아키텍처

```text
Browser
  - camera/mic capture
  - local feature extraction
  - recording/export canvas
  - signed upload to Cloudflare Worker

Next.js on Vercel
  - page rendering
  - session API
  - Supabase DB access
  - signed Worker upload request orchestration
  - result page

Cloudflare Worker
  - accept signed browser upload
  - enforce upload size/content guardrails
  - write upload to R2
  - read R2 object
  - upload video to Gemini Files API
  - call Gemini generateContent
  - write analysis result to Supabase

Supabase Free
  - sessions
  - questions
  - results
  - anonymous usage tracking
  - entitlement state

Cloudflare R2 Free
  - original session video
  - optional exported video
  - short TTL cleanup

Gemini API
  - full session video at 1 FPS
  - target question interval at 5 FPS
  - local feature JSON
  - transcript
  - structured JSON output
```

## 3. 주요 설계 결정

### 3.1 Vercel로 영상 본문 업로드 금지

Vercel Hobby는 큰 request body와 긴 작업에 약하다. Vercel은 5분짜리 업로드 토큰만 발급하고, 브라우저는 Cloudflare Worker `/upload`로 영상을 전송한다. Worker는 R2 binding으로 저장하므로 Vercel request body 제한과 R2 S3 access key 노출을 피한다.

### 3.2 Supabase Storage 미사용

Supabase Free는 저장소와 egress가 작다. DB는 Supabase를 쓰고, 영상은 R2에 둔다.

### 3.3 Gemini 입력은 이중 영상 파트로 구성

Gemini 요청에는 같은 영상 파일을 두 번 참조한다.

1. 전체 세션 영상
   - default 1 FPS
   - 전체 맥락, 답변 흐름, 오디오/영상 동기 확인

2. 진짜 질문 구간
   - `videoMetadata.startOffset`
   - `videoMetadata.endOffset`
   - `videoMetadata.fps = 5`
   - 핵심 질문의 표정/움직임 변화 보강

3. 로컬 feature JSON
   - 브라우저에서 15~30 FPS로 추출
   - Gemini가 놓칠 수 있는 빠른 신호를 수치로 보강

## 4. 데이터 모델

### 4.1 `sessions`

```sql
create table sessions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  creator_device_id text not null,
  respondent_device_id text,
  status text not null check (status in (
    'created',
    'recording',
    'uploaded',
    'analyzing',
    'complete',
    'failed',
    'expired'
  )),
  target_question text not null,
  warmup_question text not null default '오늘 하루 중 제일 기억나는 일 뭐야?',
  locale text not null default 'ko',
  source text not null default 'web'
);
```

### 4.2 `recordings`

```sql
create table recordings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  r2_key text not null,
  mime_type text not null,
  byte_size integer not null,
  duration_ms integer not null,
  warmup_start_ms integer not null,
  warmup_end_ms integer not null,
  target_start_ms integer not null,
  target_end_ms integer not null,
  expires_at timestamptz not null
);
```

### 4.3 `feature_payloads`

```sql
create table feature_payloads (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  payload_json jsonb not null,
  schema_version integer not null default 1
);
```

### 4.4 `analysis_results`

```sql
create table analysis_results (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  verdict text not null check (verdict in ('truth', 'lie')),
  headline text not null check (headline in ('진실', '거짓')),
  roast_comment text not null,
  public_json jsonb not null,
  private_json jsonb not null,
  model_name text not null,
  prompt_version integer not null,
  expires_at timestamptz not null
);
```

### 4.5 `entitlements`

```sql
create table entitlements (
  id uuid primary key default gen_random_uuid(),
  device_id text not null unique,
  created_at timestamptz not null default now(),
  free_trials_used integer not null default 0,
  credits integer not null default 0,
  source text not null default 'mvp'
);
```

## 5. 브라우저 입력 처리

### 5.0 카카오 로그인

MVP는 카카오 로그인을 전제로 한다. 로그인 계정은 무료 사용 횟수, 결과 기록, 향후 Polar/앱인토스 권한 연결에 사용한다.

초기 구현에서는 Supabase Auth 또는 별도 OAuth handler 중 프로젝트에 더 단순한 방식을 선택하되, 내부 도메인에서는 `userId`를 기준으로 세션과 entitlement를 연결한다.

### 5.1 카메라/마이크

- `navigator.mediaDevices.getUserMedia()`
- 권장 녹화 해상도: 720p
- 권장 녹화 FPS: 30 FPS
- 모바일에서는 전면 카메라 우선
- 카메라가 어두우면 시작 버튼 비활성화
- 모바일/PC 반응형 UI를 모두 지원

### 5.2 로컬 feature 추출

브라우저 feature는 내부용이며 결과 화면에는 공개하지 않는다.

Feature categories:

```ts
type FeaturePayload = {
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

type SegmentValue = {
  segment: "warmup" | "target";
  value: number;
};

type QuestionValue = {
  question: "warmup" | "target";
  value: number;
};
```

### 5.3 품질 게이트

결과를 만들지 않고 다시 촬영시키는 조건:

- 얼굴이 전체 시간의 70% 미만으로 보임
- 마이크 입력 없음
- 진짜 질문 답변이 3초 미만
- 조명 품질이 너무 낮음
- 녹화 파일이 깨짐

UI 문구:

- "얼굴이 화면에서 자꾸 사라져요. 다시 한 번만 해볼게요."
- "소리가 거의 안 들어왔어요. 마이크 켜고 다시 가봅시다."
- "너무 짧게 답했어요. AI가 일할 분량이 없습니다."

## 6. Gemini 분석 요청

### 6.1 파일 업로드

1. 브라우저가 Worker `/upload`로 원본 영상을 업로드한다.
2. Next.js가 Supabase에 recording row를 만든다.
3. Cloudflare Worker가 R2 object를 읽는다.
4. Worker가 Gemini Files API로 영상을 업로드한다.
5. Worker가 Gemini `generateContent`를 호출한다.

### 6.2 Gemini parts

```ts
const contents = [
  {
    role: "user",
    parts: [
      {
        fileData: {
          fileUri: geminiFileUri,
          mimeType: recording.mimeType
        },
        videoMetadata: {
          fps: 1
        }
      },
      {
        fileData: {
          fileUri: geminiFileUri,
          mimeType: recording.mimeType
        },
        videoMetadata: {
          startOffset: `${Math.floor(recording.targetStartMs / 1000)}s`,
          endOffset: `${Math.ceil(recording.targetEndMs / 1000)}s`,
          fps: 5
        }
      },
      {
        text: JSON.stringify({
          session,
          questions,
          transcript,
          featurePayload
        })
      }
    ]
  }
];
```

## 7. 결과 생성 규칙

Gemini는 structured JSON만 출력한다.

공개 결과:

- `headline`: `진실` 또는 `거짓`
- `roast_comment`
- `share_question`
- `share_verdict`

비공개 결과:

- 내부 score
- confidence
- 품질 점수
- segment별 판단
- feature 요약

비공개 결과는 운영 디버깅과 모델 개선용으로만 저장한다.

## 8. 영상 내보내기

MVP는 브라우저 렌더링 방식이다.

```text
camera video element
  + analysis overlay canvas
  + question text
  + countdown/result frame
  + mic audio track
→ canvas.captureStream(30)
→ MediaRecorder
→ webm download
```

가능하면 브라우저별 MIME type을 순서대로 시도한다.

```ts
const candidateMimeTypes = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4"
];
```

iOS Safari 호환성은 별도 QA 대상이다. MP4가 필요하면 추후 서버/Worker 기반 변환을 검토한다.

## 9. App in Toss 확장 설계

MVP 코드에는 직접 결제를 넣지 않지만, 아래 인터페이스를 기준으로 작성한다.

```ts
export type EntitlementSource = "mvp" | "polar" | "toss_iap" | "toss_reward_ad";

export type EntitlementState = {
  deviceId: string;
  freeTrialsUsed: number;
  credits: number;
  canStartAnalysis: boolean;
  source: EntitlementSource;
};

export interface EntitlementService {
  getState(deviceId: string): Promise<EntitlementState>;
  consumeCredit(deviceId: string): Promise<EntitlementState>;
  grantCredits(deviceId: string, credits: number, source: EntitlementSource): Promise<EntitlementState>;
}

export interface PaymentAdapter {
  createCheckout(input: { deviceId: string; productId: string }): Promise<{ url: string }>;
  handleWebhook(request: Request): Promise<void>;
}

export interface RewardAdapter {
  grantReward(input: { deviceId: string; rewardId: string }): Promise<EntitlementState>;
}
```

향후 adapter:

- `nonePaymentAdapter`
- `polarPaymentAdapter`
- `tossIapAdapter`
- `tossRewardAdAdapter`

## 10. 비용 가정

작업 가정:

- 전체 세션 45초
- 전체 영상 1 FPS
- 진짜 질문 구간 15초 5 FPS
- feature JSON 8,000 tokens 이하
- output 2,000 tokens 이하
- 모델: Gemini 2.5 Flash
- 환율 계산용 가정: 1 USD = 1,500 KRW

예상 Gemini 비용:

- 전체 1 FPS만: 약 16~22원
- 전체 1 FPS + 진짜 질문 5 FPS: 약 24~30원
- 전체 5 FPS: 약 37~45원

MVP 기본값은 전체 1 FPS + 진짜 질문 5 FPS다.

## 11. 보안/운영

- Gemini API key는 Cloudflare Worker secret으로 둔다.
- Worker upload token은 짧은 TTL로 발급한다.
- R2 object key는 session id 기반으로 예측 어렵게 만든다.
- 영상은 R2 lifecycle로 1일 후 삭제한다.
- 브라우저 업로드는 95MB 이하만 허용한다.
- Supabase row는 새 세션 생성 시 `cleanup_expired_sessions` RPC로 만료분을 점진 삭제한다.
- Supabase public anon key는 RLS 정책으로 제한한다.
- 결과 페이지는 UUID 기반 URL로 접근한다.

### 11.1 분석 큐잉

업로드 완료 API는 `complete_session_upload` RPC를 실행한 뒤 `ANALYSIS_WORKER_URL`의 `/analyze` endpoint를 호출한다.

필수 env:

- `ANALYSIS_WORKER_URL`
- `WORKER_SHARED_SECRET`

Worker 큐잉이 실패하면 업로드 완료 API는 실패 응답을 반환한다. 이렇게 해야 사용자가 분석 화면에서 결과 없이 기다리는 상태를 막을 수 있다.

### 11.2 로컬 feature JSON

브라우저는 녹화 중 250ms 간격으로 다음 feature를 수집한다.

- video brightness
- frame motion score
- center green-channel rPPG proxy
- audio RMS energy
- pitch proxy
- MediaPipe Face Landmarker가 로드되는 경우 face visible, blink blendshape, mouth movement, gaze/head proxy

MediaPipe 모델 로딩이 실패해도 세션은 중단하지 않는다. 이 경우 `feature_payload.extraction.status`는 `partial`로 저장되고 영상/audio aggregate feature와 Gemini video input을 함께 사용한다.

### 11.3 Kakao Login

Kakao 로그인은 Supabase Auth OAuth provider를 통해 처리한다.

- 브라우저 시작: `src/lib/auth/kakao.ts`
- OAuth callback: `src/app/auth/callback/route.ts`
- 로그인 사용자 세션 연결: `src/app/api/sessions/route.ts`

로그인 사용자가 있으면 `sessions.user_id`, `sessions.kakao_user_id`를 저장한다. 로그인하지 않아도 device id 기반 MVP 플로우는 유지한다.

## 12. 참고 자료

- Gemini video understanding: https://ai.google.dev/gemini-api/docs/video-understanding
- Gemini Files API: https://ai.google.dev/gemini-api/docs/files
- Gemini pricing: https://ai.google.dev/gemini-api/docs/pricing
- Gemini structured output: https://ai.google.dev/gemini-api/docs/structured-output
- MediaPipe Face Landmarker: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js
- MediaRecorder: https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder
- canvas.captureStream: https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream
- Web Audio API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- 앱인토스 인앱결제: https://developers-apps-in-toss.toss.im/iap/intro.html
