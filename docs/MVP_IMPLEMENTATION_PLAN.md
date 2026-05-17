# MVP 구현 계획 인덱스

상세 구현 체크리스트는 아래 문서에 있다.

- `docs/superpowers/plans/2026-05-17-ai-lie-detector-mvp.md`

## 구현 순서

1. Next.js 프로젝트 스캐폴딩
2. Gemini 결과 스키마와 guardrail 테스트
3. Supabase DB schema
4. entitlement/payment adapter 경계
5. 녹화 및 local feature 유틸
6. 세션 API
7. 카메라/마이크 녹화 hook
8. 질문 생성/답변/결과 페이지
9. Cloudflare Worker + R2 + Gemini Files API
10. 릴스용 브라우저 export
11. Gemini prompt wiring
12. 테스트, 빌드, 수동 QA

## 현재 MVP 범위

- 결제 없음
- 질문 2개
- 카카오 로그인 전제
- 같은 공간, 하나의 디바이스에서 진행
- 결과 headline은 `진실` 또는 `거짓`
- 공개 결과에 확률/감지 신호 없음
- 전체 영상 1 FPS + 진짜 질문 구간 5 FPS + 로컬 feature JSON
- Supabase Free + Vercel Hobby + Cloudflare R2 Free 기준
- 추후 Polar와 앱인토스 IAP/광고를 붙일 수 있는 adapter 구조
