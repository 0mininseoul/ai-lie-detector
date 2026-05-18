import { ArrowRight, Camera, Eye, LockKeyhole, Mic, ScanFace, Waves } from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";

const steps = [
  {
    id: "01",
    title: "질문 잠그기",
    body: "내가 진짜 물어보고 싶은 한 줄을 화면에 등록합니다. 잠근 순간부터 상대 카메라가 켜져요."
  },
  {
    id: "02",
    title: "상대가 대답",
    body: "상대에게 기기를 넘기면 워밍업 질문 한 번 → 진짜 질문 한 번 순서로 카메라·마이크가 같이 돌아갑니다."
  },
  {
    id: "03",
    title: "AI가 판정",
    body: "얼굴·시선·음성·답변 리듬을 동시에 보고 진실/거짓 한 단어로 답합니다. 릴스용 결과 카드도 자동."
  }
];

const signals = [
  { icon: ScanFace, label: "얼굴 표정", note: "마이크로 표정 변화의 빈도와 강도" },
  { icon: Eye, label: "시선 흐름", note: "시선이 머무는 위치와 회피 패턴" },
  { icon: Waves, label: "음성 파형", note: "피치·진폭·떨림과 호흡 텀" },
  { icon: Mic, label: "답변 리듬", note: "대답까지 걸린 시간과 단어 밀도" }
];

const sampleVerdicts = [
  { headline: "거짓", question: "어제 누구랑 있었어?", roast: "이미 흔들렸어요. 다시 물어보세요." },
  { headline: "진실", question: "최근에 숨긴 거 하나라도 있어?", roast: "이번엔 깔끔합니다. 진실 80%." },
  { headline: "거짓", question: "나 몰래 연락하는 사람 있어?", roast: "눈이 두 번이나 빠져나갔어요." }
];

export default function HomePage() {
  return (
    <main className={styles.shell}>
      <header className={styles.nav}>
        <Link href="/" className={styles.logo}>
          <span className={styles.logoMark} aria-hidden>
            <ScanFace size={18} />
          </span>
          <span>AI 거짓말탐지기</span>
        </Link>
        <div className={styles.navLinks}>
          <Link href="/price">가격</Link>
          <Link href="/new" className={styles.navCta}>
            지금 시작하기
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.heroCopy}>
          <span className={styles.kicker}>
            <span aria-hidden className={styles.kickerDot} />
            AI Vision · Multimodal Verdict
          </span>
          <h1 id="home-title">
            <span>AI는</span>
            <span>거짓말을</span>
            <span className={styles.heroAccent}>알아챌까?</span>
          </h1>
          <p className={styles.heroLead}>
            질문 한 줄을 잠그면, 상대가 대답하는 사이 AI가 얼굴·시선·음성·리듬을
            동시에 본다. 결과는 진실 또는 거짓, 한 단어로.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/new" className={styles.primaryCta}>
              지금 질문 만들기
              <ArrowRight size={16} aria-hidden />
            </Link>
            <a href="#how" className={styles.secondaryCta}>
              어떻게 작동하는지 보기
            </a>
          </div>
          <ul className={styles.heroMeta}>
            <li>
              <LockKeyhole size={14} aria-hidden /> 1회 무료 · 카카오로 시작
            </li>
            <li>
              <Camera size={14} aria-hidden /> 카메라·마이크는 그 자리에서만 사용
            </li>
          </ul>
        </div>

        <div className={styles.heroVisual} aria-hidden>
          <div className={styles.heroVisualGrid} />
          {sampleVerdicts.map((sample, index) => (
            <article
              key={sample.question}
              className={styles.sampleCard}
              data-tone={sample.headline === "거짓" ? "red" : "mint"}
              data-position={index}
            >
              <span className={styles.sampleBrand}>AI 거짓말탐지기</span>
              <strong className={styles.sampleHeadline}>{sample.headline}</strong>
              <p className={styles.sampleRoast}>{sample.roast}</p>
              <div className={styles.sampleQuestion}>
                <span>질문</span>
                <p>{sample.question}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.how} id="how" aria-labelledby="how-title">
        <header className={styles.sectionHead}>
          <span className={styles.sectionLabel}>HOW IT WORKS</span>
          <h2 id="how-title">잠그고, 묻고, 판정받는다. 그게 전부.</h2>
        </header>
        <div className={styles.stepGrid}>
          {steps.map((step) => (
            <article key={step.id} className={styles.stepCard}>
              <span className={styles.stepNumber}>{step.id}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.signals} aria-labelledby="signals-title">
        <header className={styles.sectionHead}>
          <span className={styles.sectionLabel}>WHAT AI READS</span>
          <h2 id="signals-title">AI가 동시에 보는 네 가지 신호.</h2>
          <p className={styles.sectionLead}>
            한 가지 단서가 결정하지 않아요. 얼굴·시선·음성·리듬이 같은 방향으로
            기울 때 판정이 굳어집니다.
          </p>
        </header>
        <div className={styles.signalGrid}>
          {signals.map((signal) => (
            <article key={signal.label} className={styles.signalCard}>
              <span className={styles.signalIcon}>
                <signal.icon size={18} aria-hidden />
              </span>
              <strong>{signal.label}</strong>
              <p>{signal.note}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta} aria-labelledby="final-title">
        <div className={styles.finalCard}>
          <span className={styles.kicker} data-on-mint>
            <span aria-hidden className={styles.kickerDot} data-on-mint />
            지금 당신 차례
          </span>
          <h2 id="final-title">한 마디면 알 수 있어요. 지금 묻자.</h2>
          <p>1회는 무료. 결과가 마음에 들면 묶음권으로 친구 자리까지 사세요.</p>
          <div className={styles.heroCtas}>
            <Link href="/new" className={styles.primaryCta} data-on-mint>
              지금 질문 만들기
              <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/price" className={styles.secondaryCta} data-on-mint>
              가격표 보기
            </Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          <strong>AI 거짓말탐지기</strong>
          <span>커플 전용 진위 판정 MVP</span>
        </div>
        <nav>
          <Link href="/new">시작하기</Link>
          <Link href="/price">가격</Link>
        </nav>
      </footer>
    </main>
  );
}
