"use client";

import { Check, Minus, Plus, Sparkles, Users } from "lucide-react";
import { useMemo, useState } from "react";
import styles from "./pricing-card.module.css";

type BillingMode = "single" | "bundle";

const plans = [
  {
    id: "trial",
    name: "무료 체험",
    description: "처음 한 번",
    singlePrice: 0,
    bundlePrice: 0,
    baseQuestions: 1,
    features: ["첫 판은 무료", "질문 공개 결과 카드", "공유 문구 생성"]
  },
  {
    id: "single",
    name: "1회권",
    description: "바로 추궁",
    singlePrice: 990,
    bundlePrice: 790,
    baseQuestions: 1,
    features: ["원하는 질문 1개", "AI 판정 결과", "릴스용 영상 내보내기"]
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
  const price = billingMode === "single" ? activePlan.singlePrice : activePlan.bundlePrice;
  const total = useMemo(() => {
    if (activePlan.id === "trial") return 0;
    if (activePlan.id === "pack") return price;
    return price * questionCount;
  }, [activePlan.id, price, questionCount]);

  return (
    <section className={styles.card} aria-label="AI 거짓말탐지기 가격표">
      <div className={styles.header}>
        <div className={styles.badge}>
          <Sparkles size={16} aria-hidden />
          Viral MVP Price
        </div>
        <div>
          <h1>요금 고르기</h1>
          <p>무료 1회 사용 후, 다음 질문부터 1회권으로 진행하는 구조입니다.</p>
        </div>
      </div>

      <div className={styles.segmented} role="tablist" aria-label="요금 방식">
        <button
          type="button"
          className={billingMode === "single" ? styles.activeTab : ""}
          onClick={() => setBillingMode("single")}
        >
          1회권
        </button>
        <button
          type="button"
          className={billingMode === "bundle" ? styles.activeTab : ""}
          onClick={() => setBillingMode("bundle")}
        >
          묶음권
          <span>최대 30% OFF</span>
        </button>
      </div>

      <div className={styles.planList}>
        {plans.map((plan) => {
          const isSelected = selectedPlan === plan.id;
          const planPrice = billingMode === "single" ? plan.singlePrice : plan.bundlePrice;

          return (
            <button
              key={plan.id}
              type="button"
              className={isSelected ? styles.selectedPlan : styles.plan}
              onClick={() => setSelectedPlan(plan.id)}
            >
              <span className={styles.radio} aria-hidden>
                {isSelected ? <i /> : null}
              </span>
              <span className={styles.planCopy}>
                <strong>{plan.name}</strong>
                <small>{plan.description}</small>
              </span>
              <span className={styles.price}>
                <b>{formatWon.format(plan.id === "pack" ? plan.bundlePrice : planPrice)}</b>
                <small>{plan.id === "pack" ? "5회" : plan.id === "trial" ? "1회" : "질문당"}</small>
              </span>
            </button>
          );
        })}
      </div>

      <div className={styles.details}>
        <div className={styles.features}>
          {activePlan.features.map((feature) => (
            <div key={feature}>
              <Check size={16} aria-hidden />
              <span>{feature}</span>
            </div>
          ))}
        </div>

        <div className={styles.divider} />

        <div className={styles.counterRow}>
          <div className={styles.counterCopy}>
            <div className={styles.avatar}>
              <Users size={24} aria-hidden />
            </div>
            <div>
              <strong>질문 수</strong>
              <span>{activePlan.id === "pack" ? "5회권은 고정입니다" : `${questionCount}개 질문으로 계산 중입니다`}</span>
            </div>
          </div>
          <div className={styles.stepper}>
            <button
              type="button"
              onClick={() => setQuestionCount((count) => Math.max(1, count - 1))}
              disabled={activePlan.id !== "single"}
              aria-label="질문 수 줄이기"
            >
              <Minus size={14} aria-hidden />
            </button>
            <span>{activePlan.id === "pack" ? activePlan.baseQuestions : questionCount}</span>
            <button
              type="button"
              onClick={() => setQuestionCount((count) => Math.min(20, count + 1))}
              disabled={activePlan.id !== "single"}
              aria-label="질문 수 늘리기"
            >
              <Plus size={14} aria-hidden />
            </button>
          </div>
        </div>

        <div className={styles.totalRow}>
          <span>예상 결제 금액</span>
          <strong>{formatWon.format(total)}</strong>
        </div>

        <button className={styles.cta} type="button">
          {activePlan.id === "trial" ? "무료로 1회 시작하기" : "결제는 곧 연결될 예정입니다"}
        </button>
      </div>
    </section>
  );
}
