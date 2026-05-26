# 데이패스 가격 정책 재설계 — Design Spec

- 날짜: 2026-05-26
- 상태: 설계 승인 대기 (브레인스토밍 산출물)
- 결정권자: 박영민

## 1. 문제 정의

현행 가격(무료 체험 1회 → 1회권 990원 → 5회 묶음 3,900원)은 실결제 전환이 어렵다.
무료 체험 직후 사용자가 990원의 가치를 체감하지 못한다. 진단 결과 원인은 **비용이 아니라**:

1. **가치 체감**: 무료로 한 번 본 뒤 "한 건 더"에 990원을 내는 *유닛 소비* 프레이밍은 심리 저항이 크다.
2. **결제 흐름 단절**: 파티/모임에서 재미가 붙은 순간 990원/회 페이월이 흐름을 끊는다.
3. **결제 수수료 floor**: 소액 단건은 결제 수수료 효율이 나쁘다(특히 고정비형 PG).

## 2. 운영비용 실측 (코드 기반)

분석은 Cloudflare Worker(`worker/src/index.ts`)에서 `gemini-2.5-flash`로 수행한다.
비용 억제 설계가 이미 적용되어 있다: 미디어 해상도 `MEDIA_RESOLUTION_LOW`, `fps: 3`,
**타겟 답변 ~5초 구간만**(`startOffset`~`endOffset`) 전송, `thinkingBudget: 0`, `maxOutputTokens: 900`.

| 항목 | 단가(공식) | 1건 추정 |
|---|---|---|
| Gemini 입력 (영상+텍스트 ~2.8k tok) | $0.30 / 1M | ~$0.0008 |
| Gemini 오디오 입력 (~160 tok) | $1.00 / 1M | ~$0.0002 |
| Gemini 출력 (~500 tok) | $2.50 / 1M | ~$0.0013 |
| R2 저장(7일 후 자동삭제, egress 무료) + Worker + Supabase | — | <1원 |
| **분석 1건 총원가** | | **≈ 3~5원 (보수적 최악 ~15원)** |

환율 ~1,380원/$ 기준. **결론: AI/인프라는 비용 동인이 아니다.** 990원에서 원가율 1~2%.
→ 무제한 패스를 팔아도 한 세션 폭주(1인 20회)=~200원으로 마진 90%+ 유지, 어뷰징 위험 사실상 0.

## 3. 레퍼런스 전수조사

| 서비스 | 사용 패턴 | 과금 모델 | 가격 |
|---|---|---|---|
| 990원 AI 사주 (연초 SNS 바이럴) | 1회성 호기심 | 건당 결제 | 990원/건 |
| 포스텔러·점신 | 반복(매일 운세) | freemium + 코인충전 + 리포트 패키지 | 무료진입→단계별 |
| 제타 (AI 캐릭터챗) | 습관적(매일) | 기간제 패스 | 웹 10,900 / 앱 14,900원·월 |
| 크랙 (AI 캐릭터챗) | 습관적 | 기간제 패스 | 웹 8,500 / 앱 12,500원·월 |

도출 원칙:
1. **1회성 호기심 → 건당**, **습관적 사용 → 구독/패스.**
2. 웹 vs 앱 가격차(40%↑)는 **스토어 30% 수수료** 때문. 토스 경로는 이 세금이 없다 = 구조적 마진 이점.
3. 리워드 광고로 무과금 유저를 바이럴 루프에 잡아둔다 (이미 `toss_reward_ad` 보유).

## 4. 핵심 통찰: "파티 버스트" 사용

거짓말탐지기는 운세(1회성)도 캐릭터챗(매일)도 아니다. **모임·술자리·데이트에서 몰아서
여러 명을 테스트**한 뒤 몇 주 안 쓰는 버스트 패턴이다.
→ 월 구독은 부적합(낮은 리텐션·환불). **짧은 occasion-fit 무제한 패스**가 최적.
"한 건 더(유닛)"가 아니라 **"오늘 무제한(경험/한 자리)"**를 팔면 본전 심리로 전환율이 오른다.

## 5. 결정 — 데이패스 중심 모델

| 상품 | 가격 | 성격 |
|---|---|---|
| 무료 체험 | 0원 / 1회 | 바이럴 훅 (유지) |
| 🔥 **오늘 무제한** | **2,900원** | **히어로** — 결제 후 24시간 무제한 |
| 주말 무제한 (3일) | 4,900원 | 72시간 무제한 |
| 1주 무제한 | 7,900원 | 168시간 무제한 (선택, fast-follow 가능) |
| 광고 보고 무료 1회 | 0원 | 무과금 유저 리텐션 |

확정 사항:
- **990원 1회권 / 5회 묶음권 제거.** 단건 결제 상품은 더 이상 없음.
- **30일권 제외** — 노벨티 도구라 장기권은 미사용+낮은 리텐션만 부른다.
- "오늘 무제한"은 라벨이며 실제 만료는 **결제 후 24시간 롤링**(자정 컷이면 23시 구매자가 손해라 회피).
- 어뷰징 하드캡 불필요. 비정상 자동요청 방지용 가벼운 rate-limit만 둔다(예: 디바이스당 분당 N회).

## 6. 결제 — 토스페이먼츠 / 앱인토스

- **Polar 완전 제외** (의사결정 확정).
- 경로 1: 웹에서 **토스페이먼츠** 결제. 경로 2: **앱인토스 입점 + 토스페이**.
- 이점: 스토어 30% 세금 없음 → **웹·앱 가격 동일**하게 유지 가능, 마진 보존.
- 수수료: 토스페이 ~3.4%(고정비 거의 없음) → 2,900원 패스 수수료 ~100원, 소액에 적합.
- **확인 필요(스코프 밖)**: 앱인토스 입점 콘텐츠 심사(결과의 조롱 톤 통과 여부), 토스 정산 주기/최소 정산금/수익쉐어 조건.

## 7. 기술 설계 — 크레딧 → 시간 기반 패스

현행 권한 시스템은 횟수 차감식이다.
- `entitlements` 테이블: `device_id`(pk), `user_id`, `kakao_user_id`, `free_trials_used`, `credits`, `source`
- RPC `consume_analysis_credit(p_device_id)`: 무료체험 증가 또는 크레딧 차감
- RPC `grant_entitlement_credits(...)`: `entitlement_events`로 멱등 지급
- `buildEntitlementState`(`src/lib/entitlements/policy.ts`): `canStartAnalysis = freeTrialsUsed < 1 || credits > 0`

변경안 (크레딧과 공존):
1. **스키마**: `entitlements`에 `pass_expires_at timestamptz null` 추가 (활성 패스 만료 시각).
   지급 이력은 기존 `entitlement_events`에 `source`로 기록(멱등 유지).
2. **상태 판정**: `buildEntitlementState`에
   `hasActivePass = pass_expires_at != null && pass_expires_at > now()` 추가,
   `canStartAnalysis = freeTrialsUsed < FREE_TRIAL_LIMIT || credits > 0 || hasActivePass`.
3. **소비 RPC**: `consume_analysis_credit`에서 **활성 패스가 있으면 아무것도 차감하지 않음**(무제한).
   없으면 기존 로직(무료체험 → 크레딧)대로.
4. **지급 RPC**: `grant_entitlement_pass(p_device_id, p_duration_seconds, p_source, p_provider, p_provider_event_id)` 신설.
   `pass_expires_at = greatest(coalesce(pass_expires_at, now()), now()) + interval` (남은 기간에 가산),
   `entitlement_events`로 멱등.
5. **상품 정의**: `pricing-card.tsx`/`adapters.ts`의 상품 메타를 `{ id, durationSeconds, price }`로 교체
   (오늘=86400s, 주말=259200s, 주간=604800s). 크레딧 카운터(수량 조절 UI) 제거.
6. **결제 어댑터**: 현행 `nonePaymentAdapter`(`mvp`) → **토스 결제 어댑터**(`createCheckout` + 웹훅→`grant_entitlement_pass`).
   `EntitlementSource`는 `toss_iap` 활용/확장.
7. **게이팅 지점**: 분석 시작 경로(`/new`, 세션 시작, `consumeAnalysisCredit` 호출부)에서 패스 보유 시 무차감 통과.

## 8. 스코프 경계

- **이 스펙 범위**: 가격 모델 확정 + 시간 기반 패스 데이터 모델/상태 로직 + 가격 UI 개편.
- **별도 플랜으로 분리**: 토스페이먼츠/앱인토스 실제 결제 연동(체크아웃·웹훅·정산·심사)은 규모가 커서
  독립 spec→plan 사이클로 다룬다. 본 스펙은 그 연동이 호출할 `grant_entitlement_pass` 계약까지만 정의한다.

## 9. 성공 기준

- 무료 체험 1회 → 결제 전환율이 현행(990원 단건) 대비 개선.
- 결제당 평균 단가(ARPPU) 상승: 2,900원+ 티켓.
- 파티/모임 세션 내 분석 횟수(인당) 증가(무제한 효과).
- 패스 1건당 마진 90%+ 유지(원가·수수료 합산).

## 10. 오픈 이슈

- 앱인토스 입점 심사·정산 조건 확인 (7번 결제 연동 플랜 착수 전 선결).
- "오늘 무제한" 라벨 vs "24시간 무제한" 라벨 최종 카피 결정 (UI 단계).
- 무과금 리텐션용 리워드 광고 1회 충전의 일일 상한(예: 하루 1회) 정책 확정.

## 부록 — 출처

- Gemini 2.5 Flash 가격: https://ai.google.dev/gemini-api/docs/pricing
- Polar 수수료(4%+$0.40, '26.5.27부터 5%+$0.50): https://polar.sh/docs/merchant-of-record/fees
- 토스페이먼츠 수수료: https://www.tosspayments.com/about/fee
- 운세앱 비교(포스텔러·점신·마이파이): https://brunch.co.kr/@4e2b4f97d7214af/39
- 제타/크랙 패스 가격: https://namu.wiki/w/zeta(애플리케이션) , https://namu.wiki/w/크랙(애플리케이션)
