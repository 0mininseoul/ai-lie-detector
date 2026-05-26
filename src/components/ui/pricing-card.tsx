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
