# Deployment Auth Checklist

이 문서는 UI 작업과 분리된 배포/인증 체크리스트다. 아래 항목이 끝나야 실제 녹화 → R2 업로드 → Worker 분석 → Gemini 결과 저장까지 자동으로 돈다.

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
2. R2 API token 또는 S3-compatible access key를 만든다.
3. bucket CORS에 Vercel 도메인과 로컬 도메인을 허용한다.

Vercel env:

```bash
CLOUDFLARE_R2_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=
```

CORS 예시:

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
pnpm exec wrangler secret put GEMINI_API_KEY
pnpm exec wrangler secret put SUPABASE_URL
pnpm exec wrangler secret put SUPABASE_SERVICE_ROLE_KEY
pnpm exec wrangler secret put WORKER_SHARED_SECRET
pnpm exec wrangler secret put GEMINI_MODEL
pnpm exec wrangler deploy
```

Vercel env:

```bash
ANALYSIS_WORKER_URL=https://<WORKER_SUBDOMAIN>.workers.dev
WORKER_SHARED_SECRET=<same value as worker secret>
```

동작 방식:

- `/api/sessions/[id]/complete-upload`가 업로드 완료 후 Worker `/analyze`를 호출한다.
- Worker 호출이 실패하면 API가 `502` 또는 `503`으로 실패해 사용자가 무한 대기하지 않는다.

## 5. Gemini

필요 작업:

1. Google AI Studio에서 API key를 발급한다.
2. Worker secret `GEMINI_API_KEY`에 넣는다.
3. 기본 모델은 `gemini-2.5-flash`다.

주의:

- Gemini 호출은 Worker에서만 한다.
- Vercel에는 `GEMINI_API_KEY`를 넣지 않아도 된다.

## 6. Vercel

필요 작업:

1. `vercel login`을 완료한다.
2. 프로젝트를 Vercel에 연결한다.
3. 위의 Vercel env를 모두 넣는다.
4. 배포 후 Supabase Auth Redirect URLs와 R2 CORS에 최종 도메인을 추가한다.

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
- 녹화 업로드 URL: `POST /api/sessions/[id]/upload-url`
- 업로드 완료/분석 큐잉: `POST /api/sessions/[id]/complete-upload`
- 분석 재큐잉: `POST /api/sessions/[id]/analyze`
- 상태 조회: `GET /api/sessions/[id]/status`
- 결과 headline: 반드시 `진실` 또는 `거짓`
- 공개 결과/공유/내보내기에는 감지 신호를 노출하지 않는다.
