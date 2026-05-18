"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./ProfessionalOverlay.module.css";

type ModuleSeed = {
  id: string;
  label: string;
  sublabel: string;
  unit: string;
  min: number;
  max: number;
  tone: "cyan" | "amber" | "mint" | "red" | "violet";
};

const modules: ModuleSeed[] = [
  { id: "AU01", label: "AU01 · Inner Brow Raise",   sublabel: "Frontalis (med.)",       unit: "act",  min: 0.08, max: 0.62, tone: "cyan" },
  { id: "AU04", label: "AU04 · Brow Lowerer",       sublabel: "Corrugator supercilii",  unit: "act",  min: 0.04, max: 0.48, tone: "amber" },
  { id: "AU06", label: "AU06 · Cheek Raise",        sublabel: "Orbicularis oculi",      unit: "act",  min: 0.04, max: 0.4,  tone: "mint" },
  { id: "AU09", label: "AU09 · Nose Wrinkle",       sublabel: "Levator labii sup.",     unit: "act",  min: 0.02, max: 0.36, tone: "red" },
  { id: "AU12", label: "AU12 · Lip Corner Pull",    sublabel: "Zygomaticus major",      unit: "act",  min: 0.04, max: 0.44, tone: "mint" },
  { id: "AU17", label: "AU17 · Chin Raise",         sublabel: "Mentalis",               unit: "act",  min: 0.02, max: 0.32, tone: "violet" },
  { id: "AU45", label: "AU45 · Blink",              sublabel: "Levator palpebrae",      unit: "Hz",   min: 0.2,  max: 0.46, tone: "cyan" },
  { id: "GZE",  label: "Gaze Stability",            sublabel: "saccade · fixation",     unit: "σ",    min: 0.06, max: 0.42, tone: "amber" },
  { id: "F0",   label: "Pitch (F0)",                sublabel: "fundamental freq.",      unit: "Hz",   min: 108,  max: 196,  tone: "mint" },
  { id: "JTR",  label: "Jitter / Shimmer",          sublabel: "voice perturbation",     unit: "%",    min: 0.34, max: 2.6,  tone: "violet" },
  { id: "LAT",  label: "Response Latency",          sublabel: "utterance onset",        unit: "ms",   min: 380,  max: 1280, tone: "red" },
  { id: "LEX",  label: "Lexical Density",           sublabel: "token / sec",            unit: "tk",   min: 1.2,  max: 3.4,  tone: "cyan" }
];

const logLines = [
  { tag: "FRAME_SYNC",     code: "FACE_LANDMARKER_V2",      status: "ok"   },
  { tag: "AUDIO_WINDOW",   code: "16kHz · STFT 512",        status: "ok"   },
  { tag: "TXT_ALIGNMENT",  code: "VAD_ONSET 312ms",         status: "warn" },
  { tag: "GAZE_TRACK",     code: "pupil_xy locked",         status: "ok"   },
  { tag: "AU_MATRIX",      code: "12/45 active",            status: "ok"   },
  { tag: "F0_ESTIMATOR",   code: "YIN · stable",            status: "ok"   },
  { tag: "FUSION_PASS",    code: "weights · loaded",        status: "ok"   },
  { tag: "VERDICT_GATE",   code: "awaiting target window",  status: "wait" }
];

function fmt(value: number, seed: ModuleSeed): string {
  if (seed.unit === "ms") return `${Math.round(value)} ${seed.unit}`;
  if (seed.unit === "Hz" && value > 50) return `${Math.round(value)} ${seed.unit}`;
  if (seed.unit === "tk") return `${value.toFixed(2)} ${seed.unit}`;
  if (seed.unit === "%") return `${value.toFixed(2)} ${seed.unit}`;
  if (seed.unit === "σ") return `${value.toFixed(2)} ${seed.unit}`;
  return `${value.toFixed(2)} ${seed.unit}`;
}

function ratio(value: number, seed: ModuleSeed): number {
  return Math.max(0, Math.min(1, (value - seed.min) / (seed.max - seed.min)));
}

export function ProfessionalOverlay() {
  const [tick, setTick] = useState(0);
  const [logOffset, setLogOffset] = useState(0);
  const [streamSec, setStreamSec] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 820);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => {
      setLogOffset((prev) => (prev + 1) % logLines.length);
      setStreamSec((sec) => sec + 1);
    }, 1400);
    return () => window.clearInterval(id);
  }, []);

  const renderedModules = useMemo(() => {
    void tick;
    return modules.map((seed) => {
      const value = seed.min + Math.random() * (seed.max - seed.min);
      return {
        ...seed,
        value,
        ratio: ratio(value, seed),
        formatted: fmt(value, seed)
      };
    });
  }, [tick]);

  const orderedLog = useMemo(() => {
    return [...logLines.slice(logOffset), ...logLines.slice(0, logOffset)];
  }, [logOffset]);

  return (
    <section className={styles.overlay} aria-label="AI 분석 진행 상태">
      <header className={styles.header}>
        <div>
          <span className={styles.kicker}>LIVE MULTIMODAL ANALYSIS</span>
          <strong>판정 엔진 가동 중</strong>
          <em className={styles.engineMeta}>
            neural_engine · vision-2.6.1 · dontlie-core
          </em>
        </div>
        <div className={styles.headerStream} aria-hidden>
          <span>STREAM</span>
          <b>{String(streamSec).padStart(2, "0")}s</b>
          <em>· 12 channels active</em>
        </div>
      </header>

      <div className={styles.matrix}>
        {renderedModules.map((module, index) => (
          <div className={styles.module} data-tone={module.tone} key={module.id}>
            <div className={styles.moduleTop}>
              <span>{module.label}</span>
              <b>{String(index + 1).padStart(2, "0")}</b>
            </div>
            <em className={styles.moduleSub}>{module.sublabel}</em>
            <div className={styles.meter} aria-hidden>
              <i style={{ width: `${(module.ratio * 100).toFixed(1)}%` }} />
            </div>
            <span className={styles.moduleValue}>{module.formatted}</span>
          </div>
        ))}
      </div>

      <div className={styles.telemetry}>
        <div className={styles.scope} aria-hidden>
          {Array.from({ length: 28 }).map((_, index) => (
            <i
              key={index}
              style={{
                ["--h" as string]: `${30 + Math.random() * 65}%`,
                animationDelay: `${index * 38}ms`
              }}
            />
          ))}
        </div>
        <div className={styles.log}>
          {orderedLog.slice(0, 6).map((line, index) => (
            <div key={`${line.tag}-${index}`} data-status={line.status}>
              <span>{line.tag.padEnd(14, "·")}</span>
              <em>{line.code}</em>
              <i data-status={line.status} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
