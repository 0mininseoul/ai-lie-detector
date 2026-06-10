# AI 거짓말탐지기

카카오 로그인 기반의 웹 엔터테인먼트 서비스입니다. 사용자가 질문을 입력하고 같은 기기를 상대에게 넘기면, 브라우저가 카메라/마이크 답변을 녹화하고 Cloudflare Worker, R2, Vertex AI Gemini를 거쳐 `진실` 또는 `거짓` 결과를 생성합니다.

이 프로젝트는 법적, 의학적, 과학 수사 목적의 판정 도구가 아니라 공유와 재미를 위한 멀티모달 엔터테인먼트 앱입니다.

## 주요 기능

- 카카오 로그인 기반 세션 생성과 사용권 관리
- 워밍업 질문과 실제 질문으로 나뉘는 2단계 검사 플로우
- 브라우저 카메라/마이크 녹화와 로컬 feature payload 수집
- Vercel request body를 우회하는 Cloudflare Worker 직접 업로드
- Cloudflare R2 임시 영상 저장, 32MB 업로드 제한, 5분 업로드 토큰
- Vertex AI Gemini structured output 기반 결과 생성
- 공개 결과에서는 `진실`/`거짓`, 질문, 코멘트, 공유 카드만 노출
- 결과 공유, 릴스용 내보내기, 가격/이용권 UI
- Vitest 기반 도메인 로직, API, Worker 경로 테스트

## 기술 스택

- Web: Next.js 16 App Router, React 19, TypeScript, CSS Modules
- Auth/Data: Supabase Auth, Supabase Postgres, SQL migrations
- Media/AI: MediaRecorder, local feature extraction, Vertex AI Gemini
- Storage/Worker: Cloudflare Workers, Cloudflare R2, Wrangler
- Observability: Axiom
- Test: Vitest
- Deploy: Vercel, Cloudflare Workers

## 저장소 구조

```text
src/app/                 Next.js pages and API routes
src/components/          UI and export components
src/hooks/               browser recording and feature hooks
src/lib/                 domain logic, auth, Supabase, uploads, analysis
worker/                  Cloudflare Worker for upload, R2, Gemini analysis
supabase/migrations/     database schema and RPC migrations
tests/                   Vitest test suite
docs/                    PRD, technical spec, deployment notes
public/                  brand assets and fonts
```

## 시작하기

### 1. 의존성 설치

```bash
pnpm install

cd worker
pnpm install
cd ..
```

### 2. 환경변수 준비

```bash
cp .env.example .env.local
```

`.env.local`에는 최소한 아래 값을 채워야 합니다.

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

ANALYSIS_WORKER_URL=http://localhost:8787
NEXT_PUBLIC_ANALYSIS_WORKER_URL=http://localhost:8787
WORKER_SHARED_SECRET=

NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_KAKAO_JS_KEY=
```

Gemini 분석까지 로컬에서 실행하려면 Google Cloud, Vertex AI, R2, Worker secret도 필요합니다. 전체 변수 목록은 [.env.example](.env.example)와 [docs/DEPLOYMENT_AUTH_CHECKLIST.md](docs/DEPLOYMENT_AUTH_CHECKLIST.md)를 기준으로 맞추세요.

Cloudflare Worker 로컬 secret은 git에 커밋하지 않는 `worker/.dev.vars` 또는 Wrangler secret으로 관리합니다.

### 3. Supabase 준비

Supabase 프로젝트를 만들고 `supabase/migrations/`의 SQL 마이그레이션을 적용합니다.

카카오 로그인은 Supabase Auth Provider로 연결합니다. Redirect URL은 로컬 기준으로 아래 경로가 필요합니다.

```text
http://localhost:3000/auth/callback
```

### 4. 개발 서버 실행

Web 앱:

```bash
pnpm dev
```

Worker:

```bash
cd worker
pnpm dev
```

기본 접속 주소는 `http://localhost:3000`입니다. Worker dev 서버를 함께 띄우면 업로드 URL 발급과 분석 트리거 경로를 로컬에서 확인할 수 있습니다.

## 검증

권장 검증 순서는 다음과 같습니다.

```bash
pnpm exec tsc --noEmit
pnpm test
pnpm build

cd worker
pnpm typecheck
```

전체 배포 전 검증 순서는 [docs/DEPLOYMENT_AUTH_CHECKLIST.md](docs/DEPLOYMENT_AUTH_CHECKLIST.md)에 정리되어 있습니다.

## 배포 개요

1. Vercel에 Next.js 앱을 연결하고 `.env.example` 기준의 Vercel env를 설정합니다.
2. Cloudflare R2 bucket을 만들고 `recordings/` prefix에 7일 lifecycle 삭제 정책을 둡니다.
3. `worker/wrangler.toml`의 R2 binding이 실제 bucket과 맞는지 확인합니다.
4. Worker secret을 설정한 뒤 `cd worker && pnpm deploy`로 배포합니다.
5. Vercel의 `ANALYSIS_WORKER_URL`을 배포된 Worker URL로 설정합니다.
6. Supabase Auth와 Kakao Developers의 redirect URL을 운영 도메인에 맞춰 업데이트합니다.

현재 운영 리소스와 체크리스트는 [docs/LIVE_DEPLOYMENT.md](docs/LIVE_DEPLOYMENT.md)를 참고하세요.

## 핵심 런타임 흐름

```text
Browser
  -> Next.js session API
  -> Worker signed upload URL
  -> Cloudflare Worker /upload
  -> R2 temporary recording object
  -> Next.js complete-upload API
  -> Cloudflare Worker /analyze
  -> Vertex AI Gemini
  -> Supabase analysis result
  -> Next.js result page
```

공개 결과에는 내부 점수, 확률, confidence, 감지 신호를 노출하지 않습니다. 결과 headline은 반드시 `진실` 또는 `거짓` 중 하나여야 합니다.

## 문서

- [PRD](docs/PRD.md)
- [기술 설계서](docs/TECHNICAL_SPEC.md)
- [Gemini schema](docs/GEMINI_SCHEMA.md)
- [배포/인증 체크리스트](docs/DEPLOYMENT_AUTH_CHECKLIST.md)
- [라이브 배포 상태](docs/LIVE_DEPLOYMENT.md)
