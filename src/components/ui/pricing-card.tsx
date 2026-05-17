"use client";

import { Check, Minus, Plus, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import styles from "./pricing-card.module.css";

type BillingMode = "single" | "bundle";

type Plan = {
  id: string;
  name: string;
  description: string;
  singlePrice: number;
  bundlePrice: number;
  baseQuestions: number;
  features: string[];
};

const plans: Plan[] = [
  {
    id: "trial",
    name: "무료 체험",
    description: "처음 한 번",
    singlePrice: 0,
    bundlePrice: 0,
    baseQuestions: 1,
    features: ["첫 판은 무료", "질문 공개 결과 카드", "공유 문구 자동 생성"]
  },
  {
    id: "single",
    name: "1회권",
    description: "바로 추궁",
    singlePrice: 990,
    bundlePrice: 790,
    baseQuestions: 1,
    features: ["원하는 질문 1개", "AI 멀티모달 판정", "릴스용 영상 내보내기"]
  },
  {
    id: "pack",
    name: "5회권",
    description: "친구들까지",
    singlePrice: 3900,
    bundlePrice: 2900,
    baseQuestions: 5,
    features: ["질문 5개까지 사용", "결과 카드 무제한 공유", "앱인토스 확장 대비"]
  }
];

const formatWon = new Intl.NumberFormat("ko-KR", {
  style: "currency",
  currency: "KRW",
  maximumFractionDigits: 0
});

export default function PricingCard() {
  const [billingMode, setBillingMode] = useState<BillingMode>("single");
  const [selectedPlan, setSelectedPlan] = useState("single");
  const [questionCount, setQuestionCount] = useState(1);

  const activePlan = plans.find((plan) => plan.id === selectedPlan) ?? plans[1];
  const activePrice = billingMode === "single" ? activePlan.singlePrice : activePlan.bundlePrice;
  const total = useMemo(() => {
    if (activePlan.id === "trial") return 0;
    if (activePlan.id === "pack") return activePrice;
    return activePrice * questionCount;
  }, [activePlan.id, activePrice, questionCount]);

  return (
    <section className={styles.card} aria-label="AI 거짓말탐지기 가격표">
      <header className={styles.header}>
        <div className={styles.badge}>
          <Sparkles size={14} aria-hidden />
          Viral MVP Price
        </div>
        <h1>요금 고르기</h1>
        <p>무료 1회 사용 후, 1회권으로 진행하거나 묶음권으로 한꺼번에 결제할 수 있습니다.</p>
      </header>

      <div className={styles.segmented} role="tablist" aria-label="요금 방식">
        <div className={styles.segmentedTrack} aria-hidden data-mode={billingMode} />
        <button
          type="button"
          role="tab"
          aria-selected={billingMode === "single"}
          className={styles.segmentedTab}
          data-active={billingMode === "single"}
          onClick={() => setBillingMode("single")}
        >
          <span>1회권</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={billingMode === "bundle"}
          className={styles.segmentedTab}
          data-active={billingMode === "bundle"}
          onClick={() => setBillingMode("bundle")}
        >
          <span>묶음권</span>
          <em className={styles.discountPill}>최대 30% OFF</em>
        </button>
      </div>

      <div className={styles.planList}>
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const planPrice = billingMode === "single" ? plan.singlePrice : plan.bundlePrice;
          const isFree = plan.id === "trial";
          const priceLabel = isFree
            ? "무료"
            : plan.id === "pack"
              ? formatWon.format(plan.bundlePrice)
              : formatWon.format(planPrice);

          return (
            <button
              key={plan.id}
              type="button"
              className={styles.plan}
              data-selected={isSelected}
              onClick={() => setSelectedPlan(plan.id)}
              aria-pressed={isSelected}
            >
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
                  <small>{plan.id === "pack" ? "5회 묶음" : isFree ? "1회" : "질문당"}</small>
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

                  <div className={styles.divider} aria-hidden />

                  <div className={styles.counterRow}>
                    <div className={styles.counterCopy}>
                      <div className={styles.avatar} aria-hidden>
                        <Users size={20} />
                      </div>
                      <div>
                        <strong>질문 수</strong>
                        <span>
                          {plan.id === "pack"
                            ? "5회권은 고정입니다"
                            : isFree
                              ? "체험은 1회 고정"
                              : `${questionCount}개로 계산 중`}
                        </span>
                      </div>
                    </div>
                    <div className={styles.stepper} aria-hidden={plan.id !== "single"}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setQuestionCount((count) => Math.max(1, count - 1));
                        }}
                        disabled={plan.id !== "single"}
                        aria-label="질문 수 줄이기"
                      >
                        <Minus size={14} aria-hidden />
                      </button>
                      <span>
                        {plan.id === "pack" ? plan.baseQuestions : isFree ? 1 : questionCount}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setQuestionCount((count) => Math.min(20, count + 1));
                        }}
                        disabled={plan.id !== "single"}
                        aria-label="질문 수 늘리기"
                      >
                        <Plus size={14} aria-hidden />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <footer className={styles.footer}>
        <div className={styles.totalRow}>
          <span>예상 결제 금액</span>
          <strong>{formatWon.format(total)}</strong>
        </div>
        <button className={styles.cta} type="button">
          {activePlan.id === "trial" ? "무료로 1회 시작하기" : "결제는 곧 연결될 예정입니다"}
        </button>
      </footer>
    </section>
  );
}
