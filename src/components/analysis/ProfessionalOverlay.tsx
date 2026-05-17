import styles from "./ProfessionalOverlay.module.css";

const modules = [
  { label: "얼굴 프레임 추적", value: 72, tone: "cyan" },
  { label: "시선 흐름 스캔", value: 61, tone: "amber" },
  { label: "음성 파형 분석", value: 84, tone: "green" },
  { label: "답변 리듬 처리", value: 56, tone: "red" },
  { label: "표정 변화 맵", value: 69, tone: "cyan" },
  { label: "심박 신호 추정", value: 47, tone: "amber" },
  { label: "응답 패턴 비교", value: 77, tone: "green" },
  { label: "AI 판정 엔진", value: 91, tone: "red" },
  { label: "멀티모달 동기화", value: 64, tone: "cyan" }
];

const bars = [38, 62, 44, 81, 52, 70, 34, 58, 88, 46, 66, 74, 41, 79, 55, 69];

export function ProfessionalOverlay() {
  return (
    <section className={styles.overlay} aria-label="AI 분석 진행 상태">
      <div className={styles.header}>
        <div>
          <span>LIVE MULTIMODAL ANALYSIS</span>
          <strong>AI 판정 엔진 돌리는 중</strong>
        </div>
        <div className={styles.pulse} aria-hidden />
      </div>

      <div className={styles.matrix}>
        {modules.map((module, index) => (
          <div className={styles.module} data-tone={module.tone} key={module.label}>
            <div className={styles.moduleTop}>
              <span>{module.label}</span>
              <b>{String(index + 1).padStart(2, "0")}</b>
            </div>
            <div className={styles.meter} aria-hidden>
              <i style={{ width: `${module.value}%` }} />
            </div>
          </div>
        ))}
      </div>

      <div className={styles.telemetry} aria-hidden>
        <div className={styles.scope}>
          {bars.map((height, index) => (
            <i key={`${height}-${index}`} style={{ height: `${height}%`, animationDelay: `${index * 70}ms` }} />
          ))}
        </div>
        <div className={styles.log}>
          <span>FRAME_SYNC 001</span>
          <span>AUDIO_WINDOW 024</span>
          <span>TEXT_ALIGNMENT 118</span>
          <span>FINAL_PASS READY</span>
        </div>
      </div>
    </section>
  );
}
