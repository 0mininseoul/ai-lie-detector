import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./legal.module.css";

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.back}>
          <ArrowLeft size={16} aria-hidden />
          돌아가기
        </Link>
        <nav className={styles.legalNav}>
          <Link href="/legal/privacy">개인정보처리방침</Link>
          <Link href="/legal/terms">이용약관</Link>
        </nav>
      </header>
      <article className={styles.article}>{children}</article>
    </main>
  );
}
