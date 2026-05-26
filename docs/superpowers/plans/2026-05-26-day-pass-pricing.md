# 데이패스 가격 정책 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 크레딧 차감식 가격 모델을 "시간 기반 무제한 패스(오늘/주말/주간)" 모델로 전환한다 — 데이터 모델·상태 로직·가격 UI까지.

**Architecture:** `entitlements`에 `pass_expires_at`를 추가하고, 활성 패스가 있으면 분석을 무차감으로 통과시킨다. 패스 지급은 멱등 RPC `grant_entitlement_pass`로 처리(전용 grant 로그 테이블). 패스 상품 카탈로그는 순수 모듈로 분리해 UI와 테스트가 함께 쓴다. **토스 실제 결제 연동(체크아웃·웹훅)은 본 플랜 범위 밖** — 본 플랜은 `grant_entitlement_pass` 계약까지만 만든다.

**Tech Stack:** Next.js 16 / React 19, Supabase(Postgres, plpgsql RPC), TypeScript, Vitest(node env, 소스-문자열/순수함수 테스트), Zod.

**참조 스펙:** `docs/superpowers/specs/2026-05-26-day-pass-pricing-design.md`

---

## File Structure

- Create: `src/lib/payments/products.ts` — 패스 상품 카탈로그(순수). id/이름/가격/기간.
- Modify: `src/lib/payments/adapters.ts` — `EntitlementState`에 `hasActivePass`, `passExpiresAt` 추가.
- Modify: `src/lib/entitlements/policy.ts` — `EntitlementRecord.pass_expires_at`, `buildEntitlementState`/`applyAnalysisConsumption`에 패스 반영.
- Modify: `src/lib/entitlements/service.ts` — select 컬럼에 `pass_expires_at` 추가 + `grantEntitlementPass()` 추가.
- Create: `supabase/migrations/20260526120000_day_pass_entitlements.sql` — 컬럼 추가 + consume RPC 재작성(패스 단락) + `grant_entitlement_pass` RPC + `entitlement_pass_grants` 테이블.
- Modify: `src/components/ui/pricing-card.tsx` — 카운터 제거, 패스 3종 + 무료 체험 렌더.
- Modify: `src/app/price/page.tsx` — 카피 갱신.
- Create/Modify tests: `tests/pass-products.test.ts`, `tests/entitlements.test.ts`, `tests/pricing-card.test.ts`.

---

## Task 1: 패스 상품 카탈로그

**Files:**
- Create: `src/lib/payments/products.ts`
- Test: `tests/pass-products.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/pass-products.test.ts
import { describe, expect, it } from "vitest";
import { PASS_PRODUCTS, getPassProduct, formatWon } from "@/lib/payments/products";

describe("pass products", () => {
  it("offers exactly the day/weekend/week passes in order", () => {
    expect(PASS_PRODUCTS.map((p) => p.id)).toEqual(["day", "weekend", "week"]);
  });

  it("prices and durations match the spec", () => {
    expect(getPassProduct("day")).toMatchObject({ price: 2900, durationSeconds: 86_400 });
    expect(getPassProduct("weekend")).toMatchObject({ price: 4900, durationSeconds: 259_200 });
    expect(getPassProduct("week")).toMatchObject({ price: 7900, durationSeconds: 604_800 });
  });

  it("does not expose any single-use or credit product", () => {
    for (const product of PASS_PRODUCTS) {
      expect(product).not.toHaveProperty("credits");
      expect(product.durationSeconds).toBeGreaterThan(0);
    }
  });

  it("formats KRW without decimals", () => {
    expect(formatWon(2900)).toBe("₩2,900");
  });

  it("returns undefined for an unknown product id", () => {
    // @ts-expect-error unknown id is rejected at the type level but guarded at runtime
    expect(getPassProduct("month")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/pass-products.test.ts`
Expected: FAIL — cannot resolve `@/lib/payments/products`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/payments/products.ts
export type PassId = "day" | "weekend" | "week";

export type PassProduct = {
  id: PassId;
  name: string;
  tagline: string;
  price: number; // KRW
  durationSeconds: number;
  badge?: string;
};

export const PASS_PRODUCTS: PassProduct[] = [
  {
    id: "day",
    name: "오늘 무제한",
    tagline: "결제 후 24시간 무제한",
    price: 2900,
    durationSeconds: 86_400,
    badge: "🔥 인기"
  },
  {
    id: "weekend",
    name: "주말 무제한",
    tagline: "3일 동안 무제한",
    price: 4900,
    durationSeconds: 259_200
  },
  {
    id: "week",
    name: "1주 무제한",
    tagline: "7일 동안 무제한",
    price: 7900,
    durationSeconds: 604_800
  }
];

const wonFormatter = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

export function formatWon(amount: number): string {
  return wonFormatter.format(amount);
}

export function getPassProduct(id: string): PassProduct | undefined {
  return PASS_PRODUCTS.find((product) => product.id === id);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/pass-products.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/payments/products.ts tests/pass-products.test.ts
git commit -m "feat(pricing): add day/weekend/week pass product catalog"
```

---

## Task 2: 권한 상태에 활성 패스 반영

활성 패스가 있으면 무료체험·크레딧을 차감하지 않고 분석을 허용한다.

**Files:**
- Modify: `src/lib/payments/adapters.ts` (`EntitlementState`)
- Modify: `src/lib/entitlements/policy.ts` (`EntitlementRecord`, `buildEntitlementState`, `applyAnalysisConsumption`)
- Test: `tests/entitlements.test.ts`

- [ ] **Step 1: Write the failing tests (append to existing describe block)**

`tests/entitlements.test.ts`의 `baseRecord`에 `pass_expires_at: null`를 추가하고, 아래 테스트를 같은 파일 `describe("entitlement policy", ...)` 안에 추가한다:

```ts
  it("allows analysis with an active pass even after the free trial is used", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const state = buildEntitlementState({
      ...baseRecord,
      free_trials_used: 1,
      credits: 0,
      pass_expires_at: future
    });

    expect(state.hasActivePass).toBe(true);
    expect(state.canStartAnalysis).toBe(true);
  });

  it("does not consume free trials or credits while a pass is active", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const state = buildEntitlementState({
      ...baseRecord,
      free_trials_used: 0,
      credits: 3,
      pass_expires_at: future
    });

    expect(applyAnalysisConsumption(state)).toMatchObject({
      freeTrialsUsed: 0,
      credits: 3,
      hasActivePass: true,
      canStartAnalysis: true
    });
  });

  it("treats an expired pass as no pass", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    const state = buildEntitlementState({
      ...baseRecord,
      free_trials_used: 1,
      credits: 0,
      pass_expires_at: past
    });

    expect(state.hasActivePass).toBe(false);
    expect(state.canStartAnalysis).toBe(false);
  });
```

또한 기존 `baseRecord` 선언을 다음과 같이 바꾼다(컴파일 통과를 위해):

```ts
const baseRecord: EntitlementRecord = {
  device_id: "device-1",
  user_id: null,
  kakao_user_id: null,
  free_trials_used: 0,
  credits: 0,
  source: "mvp",
  pass_expires_at: null
};
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/entitlements.test.ts`
Expected: FAIL — `pass_expires_at` not on `EntitlementRecord`, `hasActivePass` not on state.

- [ ] **Step 3: Implement — `adapters.ts`**

`EntitlementState`에 두 필드를 추가한다:

```ts
export type EntitlementState = {
  deviceId: string;
  userId?: string;
  kakaoUserId?: string;
  freeTrialsUsed: number;
  credits: number;
  hasActivePass: boolean;
  passExpiresAt?: string;
  canStartAnalysis: boolean;
  source: EntitlementSource;
};
```

- [ ] **Step 4: Implement — `policy.ts`**

`EntitlementRecord`에 컬럼을 추가한다:

```ts
export type EntitlementRecord = {
  device_id: string;
  user_id: string | null;
  kakao_user_id: string | null;
  free_trials_used: number;
  credits: number;
  source: string;
  pass_expires_at: string | null;
};
```

`buildEntitlementState`를 다음으로 교체한다:

```ts
export function buildEntitlementState(record: EntitlementRecord): EntitlementState {
  const freeTrialsUsed = clampNonNegative(record.free_trials_used);
  const credits = clampNonNegative(record.credits);
  const hasActivePass =
    record.pass_expires_at != null && new Date(record.pass_expires_at).getTime() > Date.now();

  return {
    deviceId: record.device_id,
    userId: record.user_id ?? undefined,
    kakaoUserId: record.kakao_user_id ?? undefined,
    freeTrialsUsed,
    credits,
    hasActivePass,
    passExpiresAt: record.pass_expires_at ?? undefined,
    canStartAnalysis: hasActivePass || freeTrialsUsed < FREE_TRIAL_LIMIT || credits > 0,
    source: normalizeSource(record.source)
  };
}
```

`applyAnalysisConsumption` 맨 앞에 패스 단락을 추가한다(나머지 본문은 그대로 유지):

```ts
export function applyAnalysisConsumption(state: EntitlementState): EntitlementState {
  if (state.hasActivePass) {
    return state;
  }

  if (state.freeTrialsUsed < FREE_TRIAL_LIMIT) {
    // ...기존 로직 그대로...
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/entitlements.test.ts`
Expected: PASS (기존 + 신규 테스트 모두).

- [ ] **Step 6: Commit**

```bash
git add src/lib/payments/adapters.ts src/lib/entitlements/policy.ts tests/entitlements.test.ts
git commit -m "feat(entitlements): treat active pass as unlimited, no consumption"
```

---

## Task 3: 권한 서비스 — 컬럼 select + 패스 지급 함수

**Files:**
- Modify: `src/lib/entitlements/service.ts`

> 참고: 이 서비스 함수들은 Supabase RPC를 호출하므로 실 DB 없이 단위 테스트하지 않는다(기존 코드도 동일). 정확성은 Task 4 마이그레이션 + Task 6 빌드/타입체크로 검증한다.

- [ ] **Step 1: select 컬럼에 `pass_expires_at` 추가**

`service.ts` 상단 상수를 교체한다:

```ts
const ENTITLEMENT_COLUMNS =
  "device_id,user_id,kakao_user_id,free_trials_used,credits,source,pass_expires_at";
```

- [ ] **Step 2: `grantEntitlementPass()` 추가**

`grantCredits` 함수 아래에 추가한다:

```ts
export async function grantEntitlementPass(
  deviceId: string,
  durationSeconds: number,
  source: EntitlementSource,
  providerEventId = crypto.randomUUID()
): Promise<EntitlementState> {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const duration = Math.trunc(durationSeconds);
  assertValidEntitlementSource(source);

  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error("Pass duration must be a positive integer of seconds");
  }

  const { getSupabaseServer } = await import("@/lib/supabase/server");
  const supabase = getSupabaseServer();
  const { data, error } = await supabase.rpc("grant_entitlement_pass", {
    p_device_id: normalizedDeviceId,
    p_duration_seconds: duration,
    p_source: source,
    p_provider: source,
    p_provider_event_id: providerEventId
  });

  if (error) {
    throw new Error(`Failed to grant pass: ${error.message}`);
  }

  return buildEntitlementState(toRecord(data));
}
```

- [ ] **Step 3: 타입체크로 검증**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음 (`buildEntitlementState`/`toRecord`/`normalizeDeviceId`/`assertValidEntitlementSource`는 이미 import됨).

- [ ] **Step 4: Commit**

```bash
git add src/lib/entitlements/service.ts
git commit -m "feat(entitlements): add grantEntitlementPass service + select pass column"
```

---

## Task 4: DB 마이그레이션 — 패스 컬럼 + consume 단락 + grant RPC

**Files:**
- Create: `supabase/migrations/20260526120000_day_pass_entitlements.sql`

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- supabase/migrations/20260526120000_day_pass_entitlements.sql
/*
 * Day-pass model.
 *
 * Adds a time-based "unlimited pass" alongside the existing credit/free-trial
 * model. While `entitlements.pass_expires_at > now()`, analysis is unlimited
 * and consume_analysis_credit decrements nothing.
 *
 * Passes are device-scoped for v1 (same scope the original credits used).
 * Free trials remain profile-scoped for authenticated users; that path is
 * only reached when no active pass exists.
 */

alter table entitlements
  add column if not exists pass_expires_at timestamptz;

create index if not exists entitlements_pass_expires_at_idx
  on entitlements (pass_expires_at)
  where pass_expires_at is not null;

-- Idempotency + audit log for pass grants (entitlement_events requires
-- credits > 0, so passes get their own log table).
create table if not exists entitlement_pass_grants (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  provider text not null,
  provider_event_id text not null,
  duration_seconds integer not null check (duration_seconds > 0),
  source text not null,
  created_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create index if not exists entitlement_pass_grants_device_id_idx
  on entitlement_pass_grants (device_id);

alter table entitlement_pass_grants enable row level security;
revoke all on table entitlement_pass_grants from anon, authenticated;

-- Rewrite consume_analysis_credit: active pass short-circuits everything.
drop function if exists public.consume_analysis_credit(text, uuid);

create or replace function public.consume_analysis_credit(
  p_device_id text,
  p_user_id uuid default null
)
returns entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  ent entitlements;
  touched_profile profiles;
begin
  if length(trim(p_device_id)) < 8 or length(p_device_id) > 128 then
    raise exception 'Invalid device id';
  end if;

  insert into entitlements (device_id, user_id)
  values (p_device_id, case when p_user_id is null then null else p_user_id::text end)
  on conflict (device_id) do update
  set user_id = coalesce(entitlements.user_id, excluded.user_id);

  -- Step 0: active unlimited pass → consume nothing.
  select * into ent from entitlements where device_id = p_device_id;
  if ent.pass_expires_at is not null and ent.pass_expires_at > now() then
    return ent;
  end if;

  -- Step 1a: authenticated user's profile-level free trial.
  if p_user_id is not null then
    update profiles
    set free_trials_used = free_trials_used + 1,
        updated_at = now()
    where id = p_user_id
      and free_trials_used < 1
      and is_blocked = false
    returning * into touched_profile;

    if touched_profile.id is not null then
      select * into ent from entitlements where device_id = p_device_id;
      return ent;
    end if;
  end if;

  -- Step 1b: anonymous caller — device-scoped trial (legacy path).
  if p_user_id is null then
    update entitlements
    set free_trials_used = free_trials_used + 1,
        updated_at = now()
    where device_id = p_device_id
      and free_trials_used < 1
    returning * into ent;

    if ent.id is not null then
      return ent;
    end if;
  end if;

  -- Step 2: device-scoped paid credits.
  update entitlements
  set credits = credits - 1,
      updated_at = now()
  where device_id = p_device_id
    and credits > 0
  returning * into ent;

  if ent.id is not null then
    return ent;
  end if;

  -- Step 3: profile.manual_credits (admin escape hatch).
  if p_user_id is not null then
    update profiles
    set manual_credits = manual_credits - 1,
        updated_at = now()
    where id = p_user_id
      and manual_credits > 0
      and is_blocked = false
    returning * into touched_profile;

    if touched_profile.id is not null then
      select * into ent from entitlements where device_id = p_device_id;
      return ent;
    end if;
  end if;

  raise exception 'No analysis credits available';
end;
$$;

revoke all on function public.consume_analysis_credit(text, uuid)
  from public, anon, authenticated;
grant execute on function public.consume_analysis_credit(text, uuid)
  to service_role;

-- Grant (or extend) a time-based pass, idempotent on (provider, event id).
create or replace function public.grant_entitlement_pass(
  p_device_id text,
  p_duration_seconds integer,
  p_source text,
  p_provider text,
  p_provider_event_id text
)
returns entitlements
language plpgsql
security definer
set search_path = public
as $$
declare
  ent entitlements;
  inserted_id uuid;
begin
  if length(trim(p_device_id)) < 8 or length(p_device_id) > 128 then
    raise exception 'Invalid device id';
  end if;

  if p_duration_seconds is null or p_duration_seconds <= 0 then
    raise exception 'Pass duration must be positive';
  end if;

  insert into entitlement_pass_grants
    (device_id, provider, provider_event_id, duration_seconds, source)
  values
    (p_device_id, p_provider, p_provider_event_id, p_duration_seconds, p_source)
  on conflict (provider, provider_event_id) do nothing
  returning id into inserted_id;

  insert into entitlements (device_id)
  values (p_device_id)
  on conflict (device_id) do nothing;

  -- Duplicate event → do not extend again; return current state.
  if inserted_id is null then
    select * into ent from entitlements where device_id = p_device_id;
    return ent;
  end if;

  update entitlements
  set pass_expires_at =
        greatest(coalesce(pass_expires_at, now()), now())
          + make_interval(secs => p_duration_seconds),
      source = p_source,
      updated_at = now()
  where device_id = p_device_id
  returning * into ent;

  return ent;
end;
$$;

revoke all on function public.grant_entitlement_pass(text, integer, text, text, text)
  from public, anon, authenticated;
grant execute on function public.grant_entitlement_pass(text, integer, text, text, text)
  to service_role;
```

- [ ] **Step 2: 마이그레이션 적용 검증 (로컬 DB)**

Run: `pnpm supabase db reset`
Expected: 모든 마이그레이션이 에러 없이 적용되고, `20260526120000_day_pass_entitlements.sql`까지 통과. (Supabase CLI/Docker 미구동 시 `pnpm supabase start` 먼저.)

- [ ] **Step 3: RPC 동작 수동 확인 (psql 또는 Studio)**

Run (로컬 DB에 연결 후):
```sql
select grant_entitlement_pass('plan-test-device', 86400, 'toss_iap', 'toss_iap', 'evt-1');
select pass_expires_at from entitlements where device_id = 'plan-test-device'; -- ~now()+1d
select grant_entitlement_pass('plan-test-device', 86400, 'toss_iap', 'toss_iap', 'evt-1'); -- 멱등: 연장 안 됨
select consume_analysis_credit('plan-test-device', null); -- 패스 활성: free_trials_used/credits 그대로
```
Expected: 첫 grant 후 만료가 ~24h 뒤, 같은 event id 재호출 시 만료 변동 없음, consume 후 카운터 불변.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260526120000_day_pass_entitlements.sql
git commit -m "feat(db): add pass_expires_at, pass short-circuit, grant_entitlement_pass"
```

---

## Task 5: 가격 UI — 패스 카드 + 가격 페이지 카피

**Files:**
- Modify: `src/components/ui/pricing-card.tsx` (전면 재작성: 카운터/단건 제거)
- Modify: `src/app/price/page.tsx`
- Test: `tests/pricing-card.test.ts`

- [ ] **Step 1: Write the failing test (source-string 패턴, 기존 관행과 동일)**

```ts
// tests/pricing-card.test.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const card = readFileSync(join(process.cwd(), "src/components/ui/pricing-card.tsx"), "utf8");
const pricePage = readFileSync(join(process.cwd(), "src/app/price/page.tsx"), "utf8");

describe("pricing card uses the day-pass catalog", () => {
  it("renders from the shared PASS_PRODUCTS catalog", () => {
    expect(card).toContain('from "@/lib/payments/products"');
    expect(card).toContain("PASS_PRODUCTS");
  });

  it("drops the legacy single/pack credit model", () => {
    expect(card).not.toContain("SINGLE_PRICE");
    expect(card).not.toContain("PACK_PRICE");
    expect(card).not.toContain("PACK_SIZE");
    expect(card).not.toContain("Counter");
    expect(card).not.toContain("1회권");
    expect(card).not.toContain("묶음권");
  });

  it("keeps a free trial entry as the viral hook", () => {
    expect(card).toContain("무료 체험");
  });
});

describe("price page copy reflects passes", () => {
  it("no longer promises per-question single pricing", () => {
    expect(pricePage).not.toContain("1회권");
    expect(pricePage).not.toContain("묶음권");
  });
  it("mentions unlimited passes", () => {
    expect(pricePage).toContain("무제한");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/pricing-card.test.ts`
Expected: FAIL — 현재 카드에 `SINGLE_PRICE`/`Counter`/`1회권` 존재, products import 없음.

- [ ] **Step 3: `pricing-card.tsx` 전면 재작성**

파일 전체를 다음으로 교체한다:

```tsx
"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { PASS_PRODUCTS, formatWon, type PassId } from "@/lib/payments/products";
import styles from "./pricing-card.module.css";

type Selection = "trial" | PassId;

const features: Record<Selection, string[]> = {
  trial: ["1회 무료 사용", "결과 카드 자동 생성", "공유 문구 추천"],
  day: ["오늘 하루 판정 무제한", "친구 여러 명 연속 테스트", "결과 카드 무제한 공유"],
  weekend: ["3일 동안 판정 무제한", "여행·모임 내내 사용", "결과 카드 무제한 공유"],
  week: ["7일 동안 판정 무제한", "가장 자주 쓰는 사람용", "결과 카드 무제한 공유"]
};

export default function PricingCard() {
  const [selected, setSelected] = useState<Selection>("day");

  const total = useMemo(() => {
    if (selected === "trial") return 0;
    return PASS_PRODUCTS.find((product) => product.id === selected)?.price ?? 0;
  }, [selected]);

  const ctaLabel = selected === "trial" ? "무료로 시작하기" : "결제 연결은 곧 열려요";

  return (
    <section className={styles.card} aria-label="AI 거짓말탐지기 가격표">
      <header className={styles.header}>
        <div className={styles.badge}>Unlimited Pass</div>
        <h1>요금 고르기</h1>
        <p>첫 판은 무료로, 그다음엔 한 자리에서 마음껏 쓰는 무제한 패스로.</p>
      </header>

      <div className={styles.planList}>
        <Plan
          id="trial"
          name="무료 체험"
          tagline="처음 한 번 무료"
          priceLabel="무료"
          unitLabel="1회 체험"
          selected={selected === "trial"}
          onSelect={() => setSelected("trial")}
          features={features.trial}
        />
        {PASS_PRODUCTS.map((product) => (
          <Plan
            key={product.id}
            id={product.id}
            name={product.name}
            tagline={product.tagline}
            priceLabel={formatWon(product.price)}
            unitLabel="무제한"
            badge={product.badge}
            selected={selected === product.id}
            onSelect={() => setSelected(product.id)}
            features={features[product.id]}
          />
        ))}
      </div>

      <footer className={styles.footer}>
        <div className={styles.totalRow}>
          <span>예상 결제 금액</span>
          <strong>{formatWon(total)}</strong>
        </div>
        {selected === "trial" ? (
          <Link className={styles.cta} href="/new">
            {ctaLabel}
          </Link>
        ) : (
          <button className={styles.cta} type="button">
            {ctaLabel}
          </button>
        )}
      </footer>
    </section>
  );
}

type PlanProps = {
  id: Selection;
  name: string;
  tagline: string;
  priceLabel: string;
  unitLabel: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
  features: string[];
};

function Plan({ name, tagline, priceLabel, unitLabel, badge, selected, onSelect, features }: PlanProps) {
  return (
    <div
      role="button"
      tabIndex={0}
      className={styles.plan}
      data-selected={selected}
      aria-pressed={selected}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {badge ? <div className={styles.savingsBadge}>{badge}</div> : null}
      <div className={styles.planTop}>
        <span className={styles.radio} aria-hidden>
          <i data-on={selected} />
        </span>
        <div className={styles.planCopy}>
          <strong>{name}</strong>
          <small>{tagline}</small>
        </div>
        <div className={styles.price}>
          <b>{priceLabel}</b>
          <small>{unitLabel}</small>
        </div>
      </div>
      <div className={styles.planReveal} data-open={selected}>
        <div className={styles.planRevealInner}>
          <div className={styles.features}>
            {features.map((feature, index) => (
              <div key={feature} style={{ transitionDelay: `${index * 60}ms` }}>
                <Check size={14} aria-hidden />
                <span>{feature}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `price/page.tsx` 카피 갱신**

`<p>...</p>` 본문을 교체한다:

```tsx
          <p>
            첫 판은 무료로 분위기를 보고, 그다음엔 오늘 하루부터 일주일까지
            무제한 패스로 마음껏 쓰세요. 결제 연결은 곧 열려요.
          </p>
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/pricing-card.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/pricing-card.tsx src/app/price/page.tsx tests/pricing-card.test.ts
git commit -m "feat(pricing): replace credit counters with day/weekend/week passes"
```

---

## Task 6: 전체 검증

**Files:** 없음 (검증 전용)

- [ ] **Step 1: 전체 테스트**

Run: `pnpm vitest run`
Expected: 전부 PASS (신규 `pass-products`, `pricing-card`, 갱신된 `entitlements` 포함).

- [ ] **Step 2: 타입체크**

Run: `pnpm exec tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 프로덕션 빌드**

Run: `pnpm build`
Expected: 성공. `/price` 라우트 정상 빌드.

- [ ] **Step 4: 최종 커밋 (변경 없으면 생략)**

```bash
git status --short
```

---

## 후속 (별도 플랜)

- **토스페이먼츠/앱인토스 결제 연동**: 체크아웃 생성 → 결제 성공 웹훅 → `grant_entitlement_pass(deviceId, durationSeconds, 'toss_iap', 'toss_iap', eventId)` 호출. CTA "결제 연결은 곧 열려요"를 실제 결제로 교체. 앱인토스 입점 심사·정산 조건 선결.
- **무제한 어뷰징 방지**: 디바이스당 분당 요청 rate-limit(원가가 낮아 우선순위 낮음).
- **무과금 리텐션**: 리워드 광고 1회 충전 일일 상한 정책.

---

## Self-Review

**1. Spec coverage**
- §5 패스 3종 + 무료 + 990/30일 제거 → Task 1(카탈로그), Task 5(UI, 단건/카운터 삭제). ✅
- §6 결제 토스, Polar 제외 → 결제 연동은 명시적 후속 플랜. 본 플랜은 `toss_iap` source 사용. ✅
- §7 `pass_expires_at` 컬럼, hasActivePass 판정, 무차감, `grant_entitlement_pass` 멱등 → Task 2/3/4. ✅
- §7 "24h 롤링/72h/168h" → Task 1 durationSeconds(86400/259200/604800). ✅
- §8 결제 연동 스코프 분리 → 후속 섹션 + Task 4가 계약(RPC)까지만. ✅

**2. Placeholder scan:** TODO/TBD/"적절히 처리" 없음. 모든 코드 스텝에 완전한 코드 포함. ✅

**3. Type consistency:** `PassId`(Task1) = `EntitlementState.source` 무관; `getPassProduct`/`PASS_PRODUCTS`/`formatWon`(Task1)이 Task5에서 동일 시그니처로 사용. `EntitlementRecord.pass_expires_at: string | null`(Task2)와 service select 컬럼(Task3), 마이그레이션 컬럼 `pass_expires_at timestamptz`(Task4) 일치. `grant_entitlement_pass` 인자 순서(device, duration_seconds, source, provider, provider_event_id)가 service.ts 호출(Task3)과 RPC 정의(Task4)에서 일치. ✅
