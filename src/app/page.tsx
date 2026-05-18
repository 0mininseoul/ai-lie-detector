import { ArrowRight, Camera, Eye, LockKeyhole, Mic, ScanFace, Waves } from "lucide-react";
import Link from "next/link";
import styles from "./page.module.css";

const steps = [
  {
    id: "01",
    title: "질문 잠그기",
    body: "물어보고 싶은 한 줄을 적어서 잠가요. 잠그는 순간 카메라가 켜집니다."
  },
  {
    id: "02",
    title: "상대에게 넘기기",
    body: "기기를 상대에게 건네면 가벼운 워밍업 질문이 먼저 뜨고, 그 다음에 진짜 질문이 나타나요."
  },
  {
    id: "03",
    title: "AI 판정 받기",
    body: "표정·시선·목소리·답변 리듬을 함께 보고 한 단어로 결론을 알려드려요. 릴스용 카드도 같이 만들어 드립니다."
  }
];

const signals = [
  { icon: ScanFace, label: "표정 변화", note: "눈썹·입꼬리·미세 근육의 흔들림을 잡아냅니다." },
  { icon: Eye, label: "시선 흐름", note: "어디를 보고 어디를 피하는지, 시선의 경로를 따라가요." },
  { icon: Waves, label: "목소리 결", note: "높낮이·떨림·호흡 간격에서 긴장의 흔적을 찾아요." },
  { icon: Mic, label: "답변 리듬", note: "대답까지 걸린 시간과 말의 밀도를 함께 봅니다." }
];

const sampleVerdicts = [
  { headline: "거짓", question: "어제 누구랑 있었어?", roast: "두 번 흔들렸어요. 다시 물어보셔도 될 것 같아요." },
  { headline: "진실", question: "최근에 숨긴 거 하나라도 있어?", roast: "꽤 깔끔합니다. 이번엔 믿어줘도 괜찮아요." },
  { headline: "거짓", question: "나 몰래 연락하는 사람 있어?", roast: "시선이 두 번이나 빠져나갔어요. 다시 한 번 더." }
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
          <Link href="/price" className={styles.navLink}>
            가격
          </Link>
          <Link href="/new" className={styles.navCta}>
            지금 시작
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
            <span>혹시,</span>
            <span>거짓말</span>
            <span className={styles.heroAccent}>하고 있어?</span>
          </h1>
          <p className={styles.heroLead}>
            물어보고 싶은 한 줄을 잠그고 상대에게 카메라를 넘기세요. 대답하는
            동안 AI가 표정·시선·목소리를 함께 읽고, 진실인지 거짓인지 한 단어로
            알려드립니다.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/new" className={styles.primaryCta}>
              지금 질문 만들기
              <ArrowRight size={16} aria-hidden />
            </Link>
            <a href="#how" className={styles.secondaryCta}>
              작동 방식 보기
            </a>
          </div>
          <ul className={styles.heroMeta}>
            <li>
              <LockKeyhole size={14} aria-hidden /> 첫 판은 무료 · 카카오 1초 시작
            </li>
            <li>
              <Camera size={14} aria-hidden /> 카메라·마이크는 이 기기에서만 써요
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
          <h2 id="how-title">세 단계면 결론이 나와요.</h2>
        </header>
        <ol className={styles.stepGrid}>
          {steps.map((step) => (
            <li key={step.id} className={styles.stepCard}>
              <span className={styles.stepNumber}>{step.id}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={styles.signals} aria-labelledby="signals-title">
        <header className={styles.sectionHead}>
          <span className={styles.sectionLabel}>WHAT AI READS</span>
          <h2 id="signals-title">AI는 네 가지를 동시에 봐요.</h2>
          <p className={styles.sectionLead}>
            한 가지 단서로 결정하지 않습니다. 네 신호가 같은 방향을 가리킬 때
            판정이 굳어져요.
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
            이제 당신 차례
          </span>
          <h2 id="final-title">한 마디로 확인해 볼까요?</h2>
          <p>첫 판은 무료입니다. 마음에 들면 묶음권으로 친구들 분량까지 챙겨가세요.</p>
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
