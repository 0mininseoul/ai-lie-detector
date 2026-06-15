# AI 거짓말탐지기 — Design System

이 문서는 모든 UI 작업의 기준점입니다. 새 컴포넌트를 만들거나 기존 화면을 손보기 전에 반드시 여기 정의된 토큰·패턴을 먼저 따릅니다. 코드가 이 문서와 어긋나면 코드를 고칩니다.

---

## 1. 미학 방향 (Aesthetic Direction)

**한 줄로:** Apple Liquid Glassmorphism × 한국어 코어 타이포 × 컬러 그림자.

세 가지 톤이 동시에 살아야 합니다.

1. **Liquid Glass** — 떠 있는 듯한 카드, 깊은 backdrop-filter, 빛이 위에서 떨어지는 inset highlight, 다층 컬러 그림자가 카드를 표면에서 들어올림.
2. **한국어 디스플레이 타이포 우위** — Paperlogy(페이퍼로지) ExtraBold(800)로 큰 한글 표제를 과감하게 사용. 프레젠테이션 특화 폰트라 표제에서 강한 존재감이 난다. 별도 영문 sans-serif 디스플레이 폰트는 쓰지 않음(Paperlogy의 라틴 글리프 사용). 자간(`letter-spacing`)은 큰 글자에서 마이너스, 작은 글자에서 0~0.01em.
3. **민트 한 점 + 차가운 글래스** — 표면 95%는 흰 글래스/연한 cyan 그라데이션. 그 위에 mint(#72e3ad) 한 점이 강하게 떨어짐. 따뜻한 보색은 경고(red/amber)에만 허용.

**NOT:** 보라색 그라데이션, 무지개, 반짝이는 별, 흰 배경에 떠다니는 보라/핑크 데코, Sparkles/Wand 아이콘. 이건 AI 슬롭 시각입니다. → [[feedback-no-ai-slop-visuals]]

---

## 2. 타이포그래피

### 폰트

- **시스템 기본 폰트(단일):** **Paperlogy(페이퍼로지)**. OFL 라이선스, self-host woff2를 `globals.css`의 `@font-face`로 직접 선언(`@import` 금지 — Turbopack에서 fetch 누락 사례 있음). 정적(static) face로 `400/500/600/700/800/900` 6종을 선언하고, `<head>`에서 above-the-fold 핵심 2종(800 ExtraBold·500 Medium)만 preload, 나머지는 `font-display: swap`로 lazy.
- **단일 토큰:** `--font-sans: "Paperlogy", system-ui, sans-serif`. `html`·`body`·`h1~h6`·폼 컨트롤(`button/input/textarea/select`)에 모두 `var(--font-sans)`를 명시 못박음(한국어 lang UA 스타일시트가 heading/폼에 시스템 폰트를 직접 박는 사례 차단).
- **Fallback 체인:** `"Paperlogy", system-ui, sans-serif`. `-apple-system`·`BlinkMacSystemFont` 절대 포함하지 말 것 — 한글이 시스템 폰트(Apple SD Gothic Neo)로 떨어져 serif스럽게 변함.
- 별도 영문 디스플레이 폰트(Outfit, Inter, Space Grotesk 등) 추가 금지 — 영문도 Paperlogy 라틴 글리프로 통일.
- **Pretendard 전용 OpenType 설정 금지:** 과거 `font-feature-settings: "ss03"/"cv11"/"ss04"`는 Pretendard 전용이라 Paperlogy에선 무의미/오작동. 전부 제거됨. Paperlogy는 기본 렌더를 그대로 사용.

### 폰트 웨이트 스케일

위계에 따라 굵기를 단계적으로 변주합니다. CSS 변수로 토큰화되어 있고(`globals.css`), 반드시 토큰을 통해 사용. Paperlogy 정적 face 기준 실제 값:

| 토큰 | 값 | Paperlogy face | 용도 |
|---|---|---|---|
| `--fw-display` | 800 | ExtraBold | 흰 글래스 위 큰 한글 표제(`clamp(48px, 7vw, 92px)`) |
| `--fw-display-on-color` | 800 | ExtraBold | 민트/빨강 같은 채도 높은 fill 위 표제 |
| `--fw-headline` | 700 | Bold | 섹션 헤드라인 |
| `--fw-title` | 600 | SemiBold | 카드/블록 타이틀, plan 이름 |
| `--fw-body-strong` | 600 | SemiBold | 라벨, chip 안 텍스트, 강조 본문 |
| `--fw-body` | 500 | Medium | 일반 본문 |
| `--fw-body-soft` | 400 | Regular | 보조 카피, 도움말, 롱폼 본문 |
| `--fw-caption` | 500 | Medium | 카운터, 작은 footnote, 라벨 |
| `--fw-action` | 600 | SemiBold | CTA 버튼 |

> **원칙:** display→body-soft 로 `800 → 400` 5단 램프. 같은 화면에서 굵기 종류를 3~4단계로 제한. 900(Black) face도 선언돼 있으나 표준 DOM 위계엔 쓰지 않고, result/reels 공유 클립의 canvas 판정 텍스트 같은 특수 대형 강조에만 사용.

### Mono 예외 — 포렌식/계측 라벨

시스템 기본은 Paperlogy지만, **"계측기/포렌식" 느낌을 의도한 곳만** `--font-mono`(`ui-monospace, SFMono-Regular, Menlo, …`)를 씁니다. 이건 폰트 누락이 아니라 의도된 예외입니다:

- 분석 HUD 계열: `LiveAnalysisHud`, `TelemetryStrip`, `CountdownRing`, `ProfessionalOverlay`.
- 라이브 세션(`/s/[id]`)의 telemetry eyebrow 칩(`.questionLabel` / `.questionEyebrow` — 대문자·tracking·펄스 점).
- 마크다운 인라인 `<code>`(legal 등) — 코드 표기 보편 관습.

그 외 **모든 화면·페이지·폼·heading은 Paperlogy 일괄 적용.** 새 mono 사용은 위 "계측" 범주에 들 때만 허용.

### 자간·행간

- 디스플레이(48px 이상): `letter-spacing: -0.012em ~ -0.022em`, `line-height: 0.86 ~ 0.96`.
- 본문(14~21px): `letter-spacing: 0` (한글은 음수 자간 비추), `line-height: 1.45 ~ 1.6`.
- 영문 작은 라벨(11~13px): `letter-spacing: 0.005em ~ 0.025em` (대문자 라벨일 때).
- 한글 줄바꿈은 항상 `word-break: keep-all` + 큰 표제는 `text-wrap: balance`.

---

## 3. 색상 (Color)

### 의미 토큰 (Semantic, hex — 21st theme 그대로)

| 토큰 | Light | Dark | 사용처 |
|---|---|---|---|
| `--background` | `#fcfcfc` | `#121212` | 페이지 전역 base |
| `--foreground` | `#171717` | `#e2e8f0` | 본문 텍스트 |
| `--card` | `#fcfcfc` | `#171717` | 카드 표면 |
| `--primary` | `#72e3ad` | `#006239` | CTA, 강조 |
| `--primary-foreground` | `#1e2723` | `#dde8e3` | CTA 위 텍스트 |
| `--ring` | `#72e3ad` | `#4ade80` | 포커스 링 |
| `--muted` | `#ededed` | `#1f1f1f` | 비활성/보조 면 |
| `--muted-foreground` | `#202020` | `#a2a2a2` | 보조 텍스트 |
| `--border` | `#dfdfdf` | `#292929` | 일반 라인 |
| `--destructive` | `#ca3214` | `#541c15` | 경고 |

### OKLCH 컴패니언 (그림자·라인·글래스 tint용)

```
--mint:        oklch(82% 0.16 152)   /* CTA 그라데이션 top */
--mint-deep:   oklch(64% 0.16 162)   /* CTA 그라데이션 bottom */
--mint-line:   oklch(72% 0.16 158)   /* 선택된 plan border */
--red:         oklch(58% 0.19 25)    /* 경고 */
--cyan:        oklch(70% 0.14 230)   /* 차가운 그림자/배경 wash */
--violet:      oklch(67% 0.18 292)   /* 깊이 그림자(은은) */
--amber:       oklch(78% 0.16 78)    /* 카카오/시그널 */
--kakao:       oklch(85% 0.16 95)    /* 카카오 버튼 top */
--kakao-deep:  oklch(77% 0.15 85)    /* 카카오 버튼 bottom */
```

### 글래스 표면

```
--glass:        oklch(100% 0 0 / 0.58)   /* 약한 글래스 */
--glass-strong: oklch(100% 0 0 / 0.78)   /* 진한 글래스 */
--glass-edge:   oklch(100% 0 0 / 0.82)   /* 글래스 테두리 */
--liquid-highlight: oklch(100% 0 0 / 0.92) /* 위에서 떨어지는 빛 */
--glass-tint-mint: oklch(96% 0.035 152 / 0.54)
--glass-tint-cyan: oklch(95% 0.025 230 / 0.5)
```

### 색상 사용 비율

- 흰 글래스 + 연한 cyan/mint wash: 75%
- 텍스트(거의 검정 ~ 진한 그린-그레이): 15%
- 민트 강조(CTA, 선택, 포커스): 7%
- 경고/카카오 등 보색: 3%

**그라데이션 규칙:** 항상 같은 hue 군 안에서만(`mint → mint-deep`, `kakao → kakao-deep`). hue를 가로지르는 그라데이션 (보라 → 핑크, 파랑 → 빨강) 금지.

---

## 4. 그림자 팩토리 (Shadow Factory)

**철칙 — 검은 그림자(`#000`, `rgba(0,0,0,...)`, `oklch(0% ...)`)는 코드에 절대 등장하지 않습니다.** 모든 그림자는 OKLCH 컬러 그림자고 최소 2~3겹입니다.

**다크 모드 보정:** 다크 표면에서는 mint/cyan/violet 같은 채도 높은 그림자가 카드 주변에 글로우 후광(halo)을 만들어 sci-fi/AI 슬롭처럼 보일 수 있습니다. 그래서 일반 카드 그림자(`--shadow-card`, `--shadow-card-elevated`, `--shadow-soft`, `--shadow-chip`, `--shadow-input`)는 **다크 모드에서는 채도가 매우 낮은 어두운 색**(`oklch(8% 0.018 230 / 0.5)` 정도)을 메인 그림자로 쓰고, 마지막 한 겹만 violet 0.06~0.1 alpha의 아주 미세한 hint로 깊이감을 줍니다. **`--shadow-action`/`--shadow-action-hover`만 의도적으로 mint 글로우를 유지**해 CTA가 "발광"하는 느낌을 살립니다. 일반 카드는 발광하면 안 됩니다.

### 토큰

| 토큰 | 구성 | 용도 |
|---|---|---|
| `--shadow-soft` | 3겹: mint 1px + cyan 8/22 + violet 22/58 | chip, 작은 표면 |
| `--shadow-card` | 5겹: 흰 inset highlight 2개 + mint 14/36 + cyan 34/96 + violet 60/140 | 메인 글래스 카드 |
| `--shadow-card-elevated` | 5겹: 더 진함 | 결과 카드, 강조 표면 |
| `--shadow-action` | 3겹: 흰 inset + mint 10/26 + cyan 22/54 | 민트 CTA |
| `--shadow-action-hover` | 4겹: 더 멀리 퍼짐 | 위 hover |
| `--shadow-action-warn` | 3겹: 빨강 28 + violet 62 | 경고 액션 |
| `--shadow-input` | 3겹: 흰 inset + cyan 8/22 + violet 22/48 | 입력 필드 |
| `--shadow-input-focus` | 3겹: mint ring 4px + cyan/violet | 포커스 |
| `--shadow-chip` | 3겹: 흰 inset + cyan/mint 작게 | 알약/배지 |

### 그림자 작성 공식

새 표면에 그림자를 줄 때 다음 패턴을 따릅니다:

```css
box-shadow:
  0 1px 0 oklch(100% 0 0 / 0.86) inset,     /* 1. 위쪽 inset highlight */
  0 0 0 1px oklch(100% 0 0 / 0.58) inset,   /* 2. 글래스 edge (선택) */
  0 14px 36px oklch(79% 0.17 152 / 0.18),   /* 3. mint 중거리 */
  0 34px 96px oklch(70% 0.14 230 / 0.14),   /* 4. cyan 원거리 */
  0 60px 140px oklch(67% 0.18 292 / 0.10);  /* 5. violet 가장 멀리 */
```

— 카드의 "들림"은 inset highlight + 3색의 거리·alpha 차에서 나옵니다.

---

## 5. Radius

- 일반 칩/입력: `calc(var(--radius) * 1.6)` = `0.8rem`
- 메인 카드: `calc(var(--radius) * 2)` ~ `calc(var(--radius) * 2.6)`
- 알약(pill): `999px`
- 분할 토글의 indicator: `calc(var(--radius) * 1.3)`

---

## 6. 모션 (Motion)

JS 모션 라이브러리(motion/framer-motion 등)를 추가하지 않습니다. CSS 트랜지션·키프레임만 사용.

| 토큰 | 값 | 용도 |
|---|---|---|
| `--ease-out-glass` | `cubic-bezier(0.32, 0.72, 0, 1)` | 글래스 확장 |
| `--ease-spring` | `cubic-bezier(0.4, 0, 0.2, 1.2)` | radio 활성화 |
| `--ease-standard` | `cubic-bezier(0.4, 0.0, 0.2, 1)` | 일반 |

### 패턴

- **확장/축소:** `grid-template-rows: 0fr → 1fr`. 자식은 `min-height: 0; overflow: hidden`.
- **세그먼티드 슬라이드 인디케이터:** 절대 위치 트랙을 `transform: translateX(0|100%)`로 이동, transition 320ms.
- **호버 lift:** `transform: translateY(-1px)` + 그림자 한 단계 강화.
- **radio fill:** `transform: scale(0 → 1)` + `--ease-spring`.

지속 시간: 마이크로 220~280ms, 확장 320~360ms, 그 이상 금지(렉처럼 느껴짐).

---

## 7. 컴포넌트 패턴

### 7.1 Glass Card (모든 메인 표면의 기본)

```css
border: 1px solid var(--glass-edge);
border-radius: calc(var(--radius) * 2.4);
background:
  linear-gradient(145deg, oklch(100% 0 0 / 0.92), oklch(100% 0 0 / 0.48)),
  radial-gradient(circle at 18% 0%, oklch(100% 0 0 / 0.72), transparent 36%),
  linear-gradient(315deg, oklch(79% 0.17 152 / 0.2), oklch(70% 0.14 230 / 0.1));
box-shadow: var(--shadow-card);
backdrop-filter: blur(34px) saturate(1.8);
```

— 3겹 그라데이션이 핵심. 첫 겹은 흰 노이즈, 두 번째는 위에서 떨어지는 빛, 세 번째는 mint→cyan wash.

### 7.2 Chip / Pill (작은 정보 단위)

```css
display: inline-flex; align-items: center; gap: 8px;
padding: 8px 13px;
border: 1px solid var(--glass-edge);
border-radius: 999px;
background: linear-gradient(135deg, var(--glass-strong), var(--glass-tint-mint));
box-shadow: var(--shadow-chip);
backdrop-filter: blur(20px) saturate(1.5);
font-size: 13px; font-weight: var(--fw-body-strong);
```

### 7.3 Primary CTA

```css
color: var(--primary-foreground);
background: linear-gradient(135deg, var(--mint), var(--mint-deep));
box-shadow: var(--shadow-action);
border-radius: calc(var(--radius) * 1.6);
font-weight: var(--fw-action);
letter-spacing: -0.005em;
```

— hover에서 `translateY(-1px)` + `--shadow-action-hover`.

### 7.4 Segmented Toggle (sliding indicator)

`position: relative` 컨테이너 + 절대 위치 indicator(`width: calc(50% - 4px)`) + `transform: translateX()` 슬라이드. 탭 텍스트는 `z-index: 1`. 활성 탭은 굵기를 `body-strong → headline`으로 올림.

### 7.5 Plan Card (selectable, expandable)

- 비선택: 흰 글래스 + 1px border
- 선택: 2px mint-line border + 4px 외곽 mint glow + 강화된 그림자
- 확장 영역: `grid-template-rows: 0fr → 1fr`로 features + counter 노출
- 내부 features는 `opacity 0/4px translate → 1/0` 으로 stagger

### 7.6 Locked Overlay (로그인 게이트 등)

투명 글래스 베일 + `LockKeyhole` 아이콘 + 한 줄 문구. 절대 모달/dialog로 띄우지 말 것 — 인라인 베일이 흐름을 끊지 않음.

---

## 8. 아이콘 사용 규칙

### 허용

- `lucide-react`만. 다른 아이콘 라이브러리(hugeicons, heroicons 등) 추가 금지.
- 의미를 가진 아이콘만:
  - 도메인: `ScanFace`, `Camera`, `Mic`, `Eye`, `Lock`, `LockKeyhole`, `ShieldQuestion`, `MessageCircle`, `Play`, `CircleStop`
  - 인터랙션: `Check`, `Minus`, `Plus`, `Users`, `LogOut`, `Share2`, `Download`, `RotateCcw`
- 사이즈: 14~24px. 너무 크면 슬롭처럼 보임.

### 금지 (AI slop)

- `Sparkles`, `Wand`, `Wand2`, `Stars`, `Bot`, `BrainCircuit`, `Robot`
- 채워진 grad 원 안에 둔 아이콘 자체가 이미 슬롭 신호 → chip + 텍스트로 대체

---

## 9. 레이아웃 원칙

- 최대 너비 1280px. 메인은 좌우 패딩 `clamp(18px, 3.2vw, 44px)`.
- 히어로는 `grid-template-columns: minmax(0, 1fr) minmax(360px, 540px)` 2분할이 기본. 980px 이하에서 단일 컬럼.
- 카드와 카드 사이 간격 `gap: clamp(18px, 4vw, 46px)`.
- 페이지 배경은 4겹 radial-gradient(mint/cyan/violet/amber wash) + linear base.
- `body::before` 로 위/오른쪽 아래 highlight 한 겹 더 깔아 입체감.

---

## 10. 라우팅 / 화면 책임

| 경로 | 책임 |
|---|---|
| `/` | **랜딩 (서비스 소개)** — 질문 입력 필드 없음. 히어로 + how-it-works + 신뢰 strip + 단일 CTA `/new` 또는 카카오 로그인. |
| `/new` | 질문 작성 화면(카카오 로그인 게이트 포함). 로그인 후 textarea + 예시 chip + 잠그기. |
| `/s/[id]` | 녹화 세션 화면. |
| `/result/[id]` | 결과 카드 + 공유/내보내기. |
| `/price` | 가격표 + 21st 스타일 PricingCard. |

랜딩은 **무조건 마케팅/소개**. 입력 폼·로그인 폼 자체를 랜딩 메인에 박지 않음.

### 녹화 세션 화면 규칙

- 모바일 카메라와 결과 재생 영상은 실제 서비스 화면의 배경이므로 `object-fit: cover`로 풀스크린을 채운다. iOS 브라우저에서 상하 검은 letterbox가 생기면 실패다. 데스크톱 편집/검수 화면만 원본 소스 비율 보존이 필요할 때 `contain`을 쓴다.
- 모바일 `/s/[id]`는 카메라가 화면의 기본 배경이고, 질문·타이머·가이드·CTA는 오버레이로 배치한다. 카드가 카드 아래로 겹치거나 화면 밖으로 밀리면 안 된다.
- 데스크톱 `/s/[id]`는 한쪽에 원본 비율 카메라, 반대쪽에 현재 행동(시작/질문)을 두는 2-pane product layout을 기본으로 한다. 답변 중에는 setup 안내 카드를 숨기고 질문 카드와 분석 HUD만 남긴다.
- 질문 카드는 문장을 자르지 않는다. 메인 질문은 가능한 한 한 줄을 유지하되, 크기를 줄여 맞추고 overflow/ellipsis로 숨기지 않는다.

---

## 11. 안티패턴 (절대 하지 말 것)

- ❌ `@import url(...)` 으로 폰트 로딩
- ❌ `font-family` 폴백에 `-apple-system`, `BlinkMacSystemFont` (한글 시스템 폰트로 떨어짐)
- ❌ `box-shadow`에 `#000` 또는 무채색 rgba
- ❌ 보라→핑크 그라데이션, 무지개, 다중 hue 그라데이션
- ❌ `Sparkles`/`Wand`/`Stars` 아이콘
- ❌ 같은 화면에 5종 이상의 폰트 굵기
- ❌ 단일 그림자(`box-shadow: 0 4px 12px rgba(...)`) — 항상 다층
- ❌ 모달/dialog로 로그인·잠금 게이트 띄우기
- ❌ 영문 디스플레이 폰트로 한글 헤드라인 처리
- ❌ 랜딩에 질문 입력 폼 직접 박기

---

## 12. 변경 절차

1. 새 컴포넌트 만들 때: 이 문서 7번 패턴부터 차용. 토큰 새로 만들 일이 거의 없음.
2. 토큰 추가가 필요하면 `globals.css`에 추가하고 본 문서 3~6번에 등록.
3. 모든 UI 변경은 Playwright로 실제 렌더 검수 후 마무리. h1·body의 computed font-family가 `Paperlogy`인지 확인(분석 HUD·세션 telemetry 칩·`<code>`만 `--font-mono` 예외).
4. 새 의존성 추가 금지(motion, hugeicons, number-flow 등). 정말 필요하면 사용자 컨펌.
