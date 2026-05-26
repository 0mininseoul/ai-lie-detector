import Link from "next/link";
import { ArrowRight, Gift, Infinity as InfinityIcon, RefreshCwOff } from "lucide-react";
import PricingCard from "@/components/ui/pricing-card";
import styles from "./price.module.css";

export const metadata = {
  title: "가격 | AI 거짓말탐지기",
  description: "AI 거짓말탐지기 가격표"
};

const valuePoints = [
  {
    icon: Gift,
    title: "첫 판은 공짜",
    body: "카드 등록도, 가입 강요도 없이 한 번 써봐요."
  },
  {
    icon: InfinityIcon,
    title: "패스 켜면 무제한",
    body: "기간 안에서는 횟수 걱정 없이 계속 물어봐요."
  },
  {
    icon: RefreshCwOff,
    title: "구독이 아니에요",
    body: "딱 한 번 결제, 기간 끝나면 자동결제 없이 끝."
  }
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
              하루 2,900원이면 무제한이에요.
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
                  <point.icon size={17} />
                </span>
                <div className={styles.valueText}>
                  <strong>{point.title}</strong>
                  <span>{point.body}</span>
                </div>
              </li>
            ))}
          </ul>
          <div className={styles.ctaRow}>
            <Link className={styles.cta} href="/new">
              지금 질문하기
              <ArrowRight size={16} aria-hidden />
            </Link>
            <span className={styles.ctaNote}>결제 연결은 곧 열려요</span>
          </div>
        </div>
        <PricingCard />
      </section>
    </main>
  );
}
