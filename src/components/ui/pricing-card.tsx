"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PASS_PRODUCTS, discountPercent, formatWon, type PassId } from "@/lib/payments/products";
import styles from "./pricing-card.module.css";

type Selection = "trial" | PassId;

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
          name="무료 체험"
          tagline="처음 한 번 무료"
          priceLabel="무료"
          unitLabel="1회 체험"
          selected={selected === "trial"}
          onSelect={() => setSelected("trial")}
        />
        {PASS_PRODUCTS.map((product) => {
          const discount = discountPercent(product);
          return (
            <Plan
              key={product.id}
              name={product.name}
              tagline={product.tagline}
              priceLabel={formatWon(product.price)}
              originalPriceLabel={product.originalPrice ? formatWon(product.originalPrice) : undefined}
              discountLabel={discount ? `${discount}% OFF` : undefined}
              unitLabel="무제한"
              badge={product.badge}
              selected={selected === product.id}
              onSelect={() => setSelected(product.id)}
            />
          );
        })}
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
  name: string;
  tagline: string;
  priceLabel: string;
  originalPriceLabel?: string;
  discountLabel?: string;
  unitLabel: string;
  badge?: string;
  selected: boolean;
  onSelect: () => void;
};

function Plan({
  name,
  tagline,
  priceLabel,
  originalPriceLabel,
  discountLabel,
  unitLabel,
  badge,
  selected,
  onSelect
}: PlanProps) {
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
          <span className={styles.anchor}>
            {originalPriceLabel ? (
              <>
                <s>{originalPriceLabel}</s>
                <span className={styles.arrow} aria-hidden>
                  →
                </span>
              </>
            ) : null}
            <b>{priceLabel}</b>
          </span>
          <span className={styles.priceMeta}>
            {discountLabel ? <em className={styles.off}>{discountLabel}</em> : null}
            <small>{unitLabel}</small>
          </span>
        </div>
      </div>
    </div>
  );
}
