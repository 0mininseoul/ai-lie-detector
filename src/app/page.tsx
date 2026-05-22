import { ArrowRight, Camera, Eye, LockKeyhole, Mic, ScanFace, Waves } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import styles from "./page.module.css";

const steps = [
  {
    id: "01",
    title: "질문하기",
    body: "물어보고 싶은 한 줄을 적어요. 입력 즉시 상대 카메라가 켜집니다."
  },
  {
    id: "02",
    title: "상대에게 넘기기",
    body: "기기를 상대에게 건네면 가벼운 워밍업 질문 한 번, 그 다음에 진짜 질문이 화면에 떠요."
  },
  {
    id: "03",
    title: "AI 판정 받기",
    body: "표정·시선·목소리·답변 리듬을 함께 분석해 한 단어로 결론을 알려드려요. 릴스용 카드도 같이 만들어 드립니다."
  }
];

const signals = [
  {
    icon: ScanFace,
    label: "Micro-expression Analysis",
    sub: "안면 미세 표정 분석",
    note: "FACS 기반 안면 근육 활성 단위(AU) 변화의 빈도와 강도를 프레임 단위로 추적합니다."
  },
  {
    icon: Eye,
    label: "Gaze Tracking",
    sub: "시선 추적",
    note: "동공 위치와 안구 운동(saccade), 응시 회피 패턴을 좌표 시계열로 매핑합니다."
  },
  {
    icon: Waves,
    label: "Vocal Biomarker",
    sub: "음성 바이오마커",
    note: "기본 주파수(F0)와 진폭 변동(jitter/shimmer), 호흡 간격을 동시 분석합니다."
  },
  {
    icon: Mic,
    label: "Response Latency",
    sub: "응답 지연 분석",
    note: "발화 잠복기, 음절 속도, 어휘 밀도(lexical density)를 함께 계측합니다."
  }
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
          <Image
            className={styles.logoMark}
            src="/brand/logo.png"
            alt=""
            width={36}
            height={36}
            priority
          />
          <span>AI 거짓말탐지기</span>
        </Link>
        <div className={styles.navLinks}>
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
            <span>AI 앞에선</span>
            <span className={styles.heroAccent}>거짓말이 안 통해요.</span>
          </h1>
          <p className={styles.heroLead}>
            물어보고 싶은 한 줄을 적고 상대에게 카메라를 넘기세요. 대답하는
            동안 AI가 표정·시선·목소리를 함께 읽고, 진실인지 거짓인지 한 단어로
            알려드립니다.
          </p>
          <div className={styles.heroCtas}>
            <Link href="/new" className={styles.primaryCta}>
              지금 질문하기
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
          <h2 id="signals-title">멀티모달 신호를 동시에 추론합니다.</h2>
          <p className={styles.sectionLead}>
            하나의 단서로 결정하지 않습니다. 네 개의 독립 신호가 같은 방향으로
            수렴할 때 판정이 굳어져요.
          </p>
        </header>
        <div className={styles.signalGrid}>
          {signals.map((signal) => (
            <article key={signal.label} className={styles.signalCard}>
              <span className={styles.signalIcon}>
                <signal.icon size={18} aria-hidden />
              </span>
              <div className={styles.signalLabel}>
                <strong>{signal.label}</strong>
                <em>{signal.sub}</em>
              </div>
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
          <h2 id="final-title">진실이 궁금하신가요?</h2>
          <p>첫 판은 무료입니다. 마음에 들면 묶음권으로 친구들 분량까지 챙겨가세요.</p>
          <div className={styles.heroCtas}>
            <Link href="/new" className={styles.primaryCta} data-on-mint>
              지금 질문하기
              <ArrowRight size={16} aria-hidden />
            </Link>
            <Link href="/price" className={styles.secondaryCta} data-on-mint>
              가격표 보기
            </Link>
          </div>
        </div>
      </section>

      <footer className={styles.footer}>
        <div className={styles.footerBrand}>
          <strong>AI 거짓말탐지기</strong>
          <span>표정·시선·음성·응답 패턴을 통합 분석하는 멀티모달 진위 판정 엔진</span>
        </div>
        <nav className={styles.footerNav}>
          <Link href="/new">시작하기</Link>
          <Link href="/price">가격</Link>
          <Link href="/legal/privacy">개인정보처리방침</Link>
          <Link href="/legal/terms">이용약관</Link>
        </nav>
        <div className={styles.footerLegal}>
          <span>Company: ascentum</span>
          <span>Business Registration No. 478-59-01063</span>
          <span>Address: Room 206, 51 Samjeon-ro 13-gil, Songpa-gu, Seoul, Republic of Korea</span>
          <span>Representative: Youngmin Park</span>
        </div>
      </footer>
    </main>
  );
}
