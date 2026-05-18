"use client";

import { Check, Minus, Plus, Users } from "lucide-react";
import { useMemo, useState, type ChangeEvent } from "react";
import styles from "./pricing-card.module.css";

type Plan = {
  id: string;
  name: string;
  description: string;
  totalPrice: number;
  questions: number;
  features: string[];
  savingsLabel?: string;
};

const SINGLE_PRICE = 990;
const PACK_PRICE = 3900;
const PACK_SIZE = 5;

const SINGLE_MIN = 1;
const SINGLE_MAX = 100;
const PACK_MIN = 1;
const PACK_MAX = 20;

const plans: Plan[] = [
  {
    id: "trial",
    name: "무료 체험",
    description: "처음 한 번 무료",
    totalPrice: 0,
    questions: 1,
    features: ["1회 무료 사용", "결과 카드 자동 생성", "공유 문구 추천"]
  },
  {
    id: "single",
    name: "1회권",
    description: "필요할 때 한 번",
    totalPrice: SINGLE_PRICE,
    questions: 1,
    features: ["AI 멀티모달 판정 1회", "릴스용 결과 카드", "수량 자유 조절"]
  },
  {
    id: "pack",
    name: "5회 묶음권",
    description: "친구들까지 함께",
    totalPrice: PACK_PRICE,
    questions: PACK_SIZE,
    savingsLabel: "1회당 780원 · 약 21% OFF",
    features: ["AI 멀티모달 판정 5회", "결과 카드 무제한 공유", "기간 무제한 사용"]
  }
];

const formatWon = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

type CounterProps = {
  label: string;
  helper: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
  ariaPrefix: string;
};

function Counter({ label, helper, value, min, max, onChange, ariaPrefix }: CounterProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? String(value);

  function commit(next: string) {
    const parsed = Number.parseInt(next, 10);
    onChange(clamp(parsed, min, max));
    setDraft(null);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value.replace(/[^0-9]/g, "");
    if (raw === "") {
      setDraft("");
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed)) return;
    if (parsed > max) {
      setDraft(String(max));
      onChange(max);
      return;
    }
    setDraft(raw);
    onChange(clamp(parsed, min, max));
  }

  return (
    <div className={styles.counterRow}>
      <div className={styles.counterCopy}>
        <div className={styles.avatar} aria-hidden>
          <Users size={20} />
        </div>
        <div>
          <strong>{label}</strong>
          <span>{helper}</span>
        </div>
      </div>
      <div className={styles.stepper}>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange(clamp(value - 1, min, max));
          }}
          disabled={value <= min}
          aria-label={`${ariaPrefix} 줄이기`}
        >
          <Minus size={14} aria-hidden />
        </button>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={display}
          maxLength={String(max).length}
          aria-label={`${ariaPrefix} 입력`}
          onClick={(event) => event.stopPropagation()}
          onFocus={(event) => event.currentTarget.select()}
          onChange={handleChange}
          onBlur={(event) => commit(event.target.value)}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              event.currentTarget.blur();
            }
          }}
        />
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onChange(clamp(value + 1, min, max));
          }}
          disabled={value >= max}
          aria-label={`${ariaPrefix} 늘리기`}
        >
          <Plus size={14} aria-hidden />
        </button>
      </div>
    </div>
  );
}

export default function PricingCard() {
  const [selectedPlan, setSelectedPlan] = useState<string>("single");
  const [singleCount, setSingleCount] = useState(1);
  const [packCount, setPackCount] = useState(1);

  const activePlan = plans.find((plan) => plan.id === selectedPlan) ?? plans[1];

  const total = useMemo(() => {
    if (activePlan.id === "trial") return 0;
    if (activePlan.id === "single") return SINGLE_PRICE * singleCount;
    return PACK_PRICE * packCount;
  }, [activePlan.id, packCount, singleCount]);

  const totalQuestions = useMemo(() => {
    if (activePlan.id === "trial") return 1;
    if (activePlan.id === "single") return singleCount;
    return PACK_SIZE * packCount;
  }, [activePlan.id, packCount, singleCount]);

  const perQuestion = useMemo(() => {
    if (activePlan.id === "trial") return 0;
    if (totalQuestions === 0) return 0;
    return Math.round(total / totalQuestions);
  }, [activePlan.id, total, totalQuestions]);

  const ctaLabel = activePlan.id === "trial" ? "무료로 시작하기" : "결제 연결은 곧 열려요";

  return (
    <section className={styles.card} aria-label="AI 거짓말탐지기 가격표">
      <header className={styles.header}>
        <div className={styles.badge}>Viral MVP Price</div>
        <h1>요금 고르기</h1>
        <p>첫 판은 무료로, 다음부터는 1회권 또는 묶음권으로 결제할 수 있어요.</p>
      </header>

      <div className={styles.planList}>
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const isFree = plan.id === "trial";
          const priceLabel = isFree ? "무료" : formatWon.format(plan.totalPrice);
          const unitLabel =
            plan.id === "pack"
              ? "5회 묶음"
              : plan.id === "single"
                ? "질문 1개"
                : "1회 체험";

          return (
            <div
              key={plan.id}
              role="button"
              tabIndex={0}
              className={styles.plan}
              data-selected={isSelected}
              onClick={() => setSelectedPlan(plan.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedPlan(plan.id);
                }
              }}
              aria-pressed={isSelected}
            >
              {plan.savingsLabel ? (
                <div className={styles.savingsBadge}>{plan.savingsLabel}</div>
              ) : null}

              <div className={styles.planTop}>
                <span className={styles.radio} aria-hidden>
                  <i data-on={isSelected} />
                </span>
                <div className={styles.planCopy}>
                  <strong>{plan.name}</strong>
                  <small>{plan.description}</small>
                </div>
                <div className={styles.price}>
                  <b>{priceLabel}</b>
                  <small>{unitLabel}</small>
                </div>
              </div>

              <div className={styles.planReveal} data-open={isSelected}>
                <div className={styles.planRevealInner}>
                  <div className={styles.features}>
                    {plan.features.map((feature, index) => (
                      <div key={feature} style={{ transitionDelay: `${index * 60}ms` }}>
                        <Check size={14} aria-hidden />
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  {plan.id === "single" ? (
                    <>
                      <div className={styles.divider} aria-hidden />
                      <Counter
                        label="질문 수"
                        helper={`총 ${singleCount}개 · 1개당 ${formatWon.format(SINGLE_PRICE)}`}
                        value={singleCount}
                        min={SINGLE_MIN}
                        max={SINGLE_MAX}
                        onChange={setSingleCount}
                        ariaPrefix="질문 수"
                      />
                    </>
                  ) : null}

                  {plan.id === "pack" ? (
                    <>
                      <div className={styles.divider} aria-hidden />
                      <Counter
                        label="묶음 수"
                        helper={`총 ${PACK_SIZE * packCount}회 · 묶음당 ${formatWon.format(PACK_PRICE)}`}
                        value={packCount}
                        min={PACK_MIN}
                        max={PACK_MAX}
                        onChange={setPackCount}
                        ariaPrefix="묶음 수"
                      />
                    </>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <footer className={styles.footer}>
        <div className={styles.totalRow}>
          <span>
            예상 결제 금액
            {activePlan.id !== "trial" ? (
              <em className={styles.perQuestion}>
                총 {totalQuestions}회 · 1회당 {formatWon.format(perQuestion)}
              </em>
            ) : null}
          </span>
          <strong>{formatWon.format(total)}</strong>
        </div>
        <button className={styles.cta} type="button">
          {ctaLabel}
        </button>
      </footer>
    </section>
  );
}
