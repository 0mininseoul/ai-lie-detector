import Link from "next/link";
import PricingCard from "@/components/ui/pricing-card";
import styles from "./price.module.css";

export const metadata = {
  title: "가격 | AI 거짓말탐지기",
  description: "AI 거짓말탐지기 가격표"
};

export default function PricePage() {
  return (
    <main className={styles.shell}>
      <section className={styles.hero} aria-labelledby="price-title">
        <div className={styles.copy}>
          <span>AI 거짓말탐지기 가격표</span>
          <h1 id="price-title">한 번 찔러보는 값, 커피보다 쌉니다.</h1>
          <p>
            무료 체험 1회로 분위기 먼저 보고, 그다음부터 1회권이나 5회권으로 결제하는 구조입니다.
            지금은 결제 연결 전이라 화면 설계만 먼저 잡아두었습니다.
          </p>
          <Link href="/">질문 만들러 가기</Link>
        </div>
        <PricingCard />
      </section>
    </main>
  );
}
