import Link from "next/link";
import { ArrowRight, Gift, Infinity as InfinityIcon, RefreshCwOff } from "lucide-react";
import PricingCard from "@/components/ui/pricing-card";
import styles from "./price.module.css";

export const metadata = {
  title: "가격 | AI 거짓말탐지기",
  description: "AI 거짓말탐지기 가격표"
};

const valuePoints = [
  { icon: Gift, title: "첫 판은 공짜" },
  { icon: InfinityIcon, title: "패스 켜면 무제한" },
  { icon: RefreshCwOff, title: "구독이 아니에요" }
];

export default function PricePage() {
  return (
    <main className={styles.shell}>
      <section className={styles.hero} aria-labelledby="price-title">
        <div className={styles.copy}>
          <span className={styles.kicker}>
            <span aria-hidden className={styles.kickerDot} />
            AI 거짓말탐지기 가격
          </span>
          <h1 id="price-title">
            <span className={styles.headlineLine}>찝찝하게 밤새 고민하지 마세요.</span>
            <span className={`${styles.headlineLine} ${styles.headlineAccent}`}>
              하루 2,900원에 팩트체크하세요.
            </span>
          </h1>
          <p className={styles.lead}>
            첫 판은 무료로 분위기를 보고, 마음에 들면 오늘 하루부터 일주일까지
            무제한 패스를 켜서 마음껏 확인하세요.
          </p>
          <ul className={styles.valueList}>
            {valuePoints.map((point) => (
              <li key={point.title}>
                <span className={styles.valueIcon} aria-hidden>
                  <point.icon size={16} />
                </span>
                <strong>{point.title}</strong>
              </li>
            ))}
          </ul>
          <div className={styles.ctaRow}>
            <Link className={styles.cta} href="/new">
              지금 질문하기
              <ArrowRight size={16} aria-hidden />
            </Link>
          </div>
        </div>
        <PricingCard />
      </section>
    </main>
  );
}
