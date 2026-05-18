"use client";

import { Check, Minus, Plus, Users } from "lucide-react";
import { useMemo, useState } from "react";
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
    totalPrice: 3900,
    questions: 5,
    savingsLabel: "1회당 780원 · 약 21% OFF",
    features: ["AI 멀티모달 판정 5회", "결과 카드 무제한 공유", "기간 무제한 사용"]
  }
];

const formatWon = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

export default function PricingCard() {
  const [selectedPlan, setSelectedPlan] = useState<string>("single");
  const [questionCount, setQuestionCount] = useState(1);

  const activePlan = plans.find((plan) => plan.id === selectedPlan) ?? plans[1];

  const total = useMemo(() => {
    if (activePlan.id === "trial") return 0;
    if (activePlan.id === "single") return SINGLE_PRICE * questionCount;
    return activePlan.totalPrice;
  }, [activePlan, questionCount]);

  const perQuestion = useMemo(() => {
    if (activePlan.id === "trial") return 0;
    if (activePlan.id === "single") return SINGLE_PRICE;
    return Math.round(activePlan.totalPrice / activePlan.questions);
  }, [activePlan]);

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
                      <div className={styles.counterRow}>
                        <div className={styles.counterCopy}>
                          <div className={styles.avatar} aria-hidden>
                            <Users size={20} />
                          </div>
                          <div>
                            <strong>질문 수</strong>
                            <span>{questionCount}개 · 1개당 {formatWon.format(SINGLE_PRICE)}</span>
                          </div>
                        </div>
                        <div className={styles.stepper}>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setQuestionCount((count) => Math.max(1, count - 1));
                            }}
                            aria-label="질문 수 줄이기"
                          >
                            <Minus size={14} aria-hidden />
                          </button>
                          <span>{questionCount}</span>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setQuestionCount((count) => Math.min(20, count + 1));
                            }}
                            aria-label="질문 수 늘리기"
                          >
                            <Plus size={14} aria-hidden />
                          </button>
                        </div>
                      </div>
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
              <em className={styles.perQuestion}>1회당 {formatWon.format(perQuestion)}</em>
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
