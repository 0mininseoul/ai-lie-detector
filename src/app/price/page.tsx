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
          <span className={styles.kicker}>AI 거짓말탐지기 가격</span>
          <h1 id="price-title">한 번 찔러보는 값, 커피보다 저렴해요.</h1>
          <p>
            첫 판은 무료로 분위기를 보고, 다음부터는 1회권이나 묶음권으로
            결제하시면 됩니다. 결제 연결은 곧 열려요.
          </p>
          <Link href="/new">질문 만들러 가기</Link>
        </div>
        <PricingCard />
      </section>
    </main>
  );
}
