# Deployment Auth Checklist

이 문서는 UI 작업과 분리된 배포/인증 체크리스트다. 아래 항목이 끝나야 실제 녹화 → Worker 업로드 → R2 임시 저장 → Worker 분석 → Gemini 결과 저장까지 자동으로 돈다.

## 1. Supabase

필요 작업:

1. Supabase 프로젝트를 만든다.
2. SQL editor에서 `supabase/migrations/20260517000000_init.sql`을 실행한다.
3. Project Settings → API에서 아래 값을 확인한다.

Vercel env:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

주의:

- `SUPABASE_SERVICE_ROLE_KEY`는 서버 전용이다. 브라우저에 노출하면 안 된다.
- RLS는 켜져 있고 앱 API는 service role로 접근한다.

## 2. Kakao Login Through Supabase Auth

필요 작업:

1. Kakao Developers에서 애플리케이션을 만든다.
2. Kakao Login을 활성화한다.
3. Redirect URI에 Supabase OAuth callback URL을 추가한다.

Supabase callback 형식:

```text
https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback
```

Supabase Dashboard:

1. Authentication → Providers → Kakao를 켠다.
2. Kakao REST API Key와 Client Secret을 입력한다.
3. Site URL을 배포 도메인으로 설정한다.
4. Redirect URLs에 아래를 추가한다.

```text
http://localhost:3000/auth/callback
https://<VERCEL_DOMAIN>/auth/callback
```

앱 코드:

- 브라우저 로그인: `src/lib/auth/kakao.ts`
- OAuth callback: `src/app/auth/callback/route.ts`
- 세션 저장 연결: `src/app/api/sessions/route.ts`

## 3. Cloudflare R2

필요 작업:

1. R2 bucket을 만든다.
2. bucket lifecycle rule을 넣어 `recordings/` object를 7일 후 삭제한다.
3. Worker R2 binding이 이 bucket을 바라보게 한다.
4. 브라우저가 Worker를 거쳐 업로드하므로 Vercel에는 R2 access key를 넣지 않는다.

현재 MVP 비용 가드레일:

- bucket: `ai-lie-detector-recordings`
- prefix: `recordings/`
- lifecycle: 7일 후 자동 삭제
- 앱 업로드 제한: 32MB
- Vertex AI 분석 경로: 8MB 이하는 inline, 8MB 초과는 GCS staging 후 `fileData`로 처리
- R2 S3 access key: 사용 안 함

Worker 업로드를 쓰므로 R2 CORS는 필수 경로가 아니다. 직접 업로드 테스트가 필요할 때만 아래처럼 제한적으로 둔다.

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://<VERCEL_DOMAIN>"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["content-type"],
    "ExposeHeaders": ["etag"],
    "MaxAgeSeconds": 300
  }
]
```

## 4. Cloudflare Worker

필요 작업:

1. Cloudflare 계정에 `wrangler login`으로 로그인한다.
2. `worker/wrangler.toml`의 R2 bucket binding이 실제 bucket과 맞는지 확인한다.
3. Worker secret을 넣는다.

Worker secrets:

```bash
cd worker
pnpm install
pnpm exec wrangler secret put GOOGLE_CLOUD_PROJECT
pnpm exec wrangler secret put GOOGLE_CLOUD_LOCATION
pnpm exec wrangler secret put GOOGLE_GENAI_USE_VERTEXAI
pnpm exec wrangler secret put VERTEX_AI_MODEL
pnpm exec wrangler secret put VERTEX_AI_GCS_BUCKET
pnpm exec wrangler secret put GOOGLE_SERVICE_ACCOUNT_KEY_BASE64
pnpm exec wrangler secret put SUPABASE_URL
pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY
pnpm exec wrangler secret put WORKER_SHARED_SECRET
pnpm exec wrangler deploy
```

Vercel env:

```bash
ANALYSIS_WORKER_URL=https://<WORKER_SUBDOMAIN>.workers.dev
WORKER_SHARED_SECRET=<same value as worker secret>
```

동작 방식:

- `/api/sessions/[id]/upload-url`이 5분짜리 Worker 업로드 토큰을 발급한다.
- 브라우저는 Worker `/upload`로 영상 파일을 보낸다.
- Worker는 Content-Type, Content-Length, 토큰 서명, 32MB 상한을 확인한 뒤 R2에 저장한다.
- `/api/sessions/[id]/complete-upload`가 업로드 완료 후 Worker `/analyze`를 호출한다.
- Worker 호출이 실패하면 API가 `502` 또는 `503`으로 실패해 사용자가 무한 대기하지 않는다.

## 5. Vertex AI Gemini

필요 작업:

1. Google Cloud 프로젝트에서 Vertex AI API를 활성화한다.
2. 서비스 계정을 만들고 `roles/aiplatform.user`만 부여한다.
3. 서비스 계정 JSON 키를 `.secrets/`에 저장한다. 이 디렉터리는 gitignore에 포함되어야 한다.
4. 로컬에는 아래 env를 사용한다.

```bash
GOOGLE_CLOUD_PROJECT=
GOOGLE_CLOUD_LOCATION=global
GOOGLE_GENAI_USE_VERTEXAI=true
VERTEX_AI_MODEL=gemini-2.5-flash
VERTEX_AI_GCS_BUCKET=ascentum-ai-lie-detector-vertex-staging
GOOGLE_APPLICATION_CREDENTIALS=.secrets/ai-lie-detector-vertex-ai.json
GOOGLE_SERVICE_ACCOUNT_KEY_BASE64=
```

5. Vercel과 Cloudflare Worker에는 `GOOGLE_SERVICE_ACCOUNT_KEY_BASE64`와 `VERTEX_AI_GCS_BUCKET`을 secret/env로 넣는다. JSON 키 내용과 base64 값은 출력하지 않는다.

주의:

- Gemini 호출은 Worker에서 Vertex AI REST API를 통해 한다.
- Cloudflare Worker 런타임에서는 `@google/genai`의 서비스 계정 ADC 경로가 맞지 않으므로 Worker가 서비스 계정 JWT로 OAuth 토큰을 받아 Vertex AI에 호출한다.
- Vertex AI 전환 후 Gemini Files API 업로드 경로는 사용하지 않는다. 8MB를 넘는 녹화는 같은 GCP 프로젝트의 GCS 임시 버킷에 staging하고 `fileData.fileUri=gs://...`로 넘긴다.
- GCS staging 버킷은 7일 lifecycle 삭제 정책을 둔다. Worker는 정상 경로에서 Vertex 응답 후 staging 객체 삭제도 예약한다.
- Vercel에는 `GEMINI_API_KEY`를 넣지 않는다.

## 6. Vercel

필요 작업:

1. `vercel login`을 완료한다.
2. 프로젝트를 Vercel에 연결한다.
3. 위의 Vercel env를 모두 넣는다.
4. 배포 후 Supabase Auth Redirect URLs에 최종 도메인을 추가한다.

검증 순서:

```bash
pnpm exec tsc --noEmit
pnpm exec tsc -p worker/tsconfig.json --noEmit
pnpm test
pnpm build
```

## 7. UI 작업자에게 넘겨도 되는 안정 계약

Claude로 UI를 다시 작업해도 아래 계약은 유지해야 한다.

- 세션 생성: `POST /api/sessions`
- 녹화 업로드 URL: `POST /api/sessions/[id]/upload-url` returns Worker `/upload` URL
- 업로드 완료/분석 큐잉: `POST /api/sessions/[id]/complete-upload`
- 분석 재큐잉: `POST /api/sessions/[id]/analyze`
- 상태 조회: `GET /api/sessions/[id]/status`
- 결과 headline: 반드시 `진실` 또는 `거짓`
- 공개 결과/공유/내보내기에는 감지 신호를 노출하지 않는다.
