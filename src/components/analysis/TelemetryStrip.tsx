"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./TelemetryStrip.module.css";

/*
 * Slim, ambient version of ProfessionalOverlay used while the user is
 * actually answering the target question. The big interrogation feel
 * (face mesh + countdown) does the heavy lifting up top; this strip just
 * keeps the analytical "machine is running" sensation alive without
 * stealing focus.
 */

type Metric = {
  key: string;
  label: string;
  value: string;
};

const SEED: Array<{ key: string; label: string; format: (n: number) => string; min: number; max: number }> = [
  { key: "AU01", label: "AU01", format: (n) => n.toFixed(2),                min: 0.05, max: 0.62 },
  { key: "AU04", label: "AU04", format: (n) => n.toFixed(2),                min: 0.05, max: 0.5  },
  { key: "AU06", label: "AU06", format: (n) => n.toFixed(2),                min: 0.04, max: 0.4  },
  { key: "AU12", label: "AU12", format: (n) => n.toFixed(2),                min: 0.04, max: 0.46 },
  { key: "AU45", label: "AU45", format: (n) => `${n.toFixed(2)} Hz`,        min: 0.18, max: 0.42 },
  { key: "GAZE", label: "GAZE", format: (n) => `${n.toFixed(2)} σ`,         min: 0.08, max: 0.42 },
  { key: "F0",   label: "F0",   format: (n) => `${Math.round(n)} Hz`,       min: 112,  max: 198  },
  { key: "JTR",  label: "JTR",  format: (n) => `${n.toFixed(2)}%`,          min: 0.4,  max: 2.6  },
  { key: "LAT",  label: "LAT",  format: (n) => `${Math.round(n)} ms`,       min: 380,  max: 1280 },
  { key: "LEX",  label: "LEX",  format: (n) => `${n.toFixed(2)} tk/s`,      min: 1.2,  max: 3.6  }
];

const LOG = [
  "FRAME_SYNC · FACE_LANDMARKER_V2 · ok",
  "AUDIO_WINDOW · 16kHz · STFT 512",
  "TXT_ALIGNMENT · VAD_ONSET 312ms",
  "GAZE_TRACK · pupil_xy locked",
  "AU_MATRIX · 12/45 active",
  "F0_ESTIMATOR · YIN stable",
  "FUSION_PASS · weights loaded"
];

export function TelemetryStrip() {
  const [tick, setTick] = useState(0);
  const [logIndex, setLogIndex] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 680);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    const id = window.setInterval(() => setLogIndex((i) => (i + 1) % LOG.length), 1600);
    return () => window.clearInterval(id);
  }, []);

  const metrics: Metric[] = useMemo(() => {
    void tick;
    return SEED.map((seed) => ({
      key: seed.key,
      label: seed.label,
      value: seed.format(seed.min + Math.random() * (seed.max - seed.min))
    }));
  }, [tick]);

  return (
    <aside className={styles.strip} aria-label="실시간 분석 텔레메트리">
      <div className={styles.head}>
        <span className={styles.kicker}>STREAM</span>
        <i className={styles.pulse} aria-hidden />
      </div>
      <div className={styles.metrics}>
        {metrics.map((m) => (
          <div key={m.key} className={styles.metric}>
            <span>{m.label}</span>
            <b>{m.value}</b>
          </div>
        ))}
      </div>
      <div className={styles.log} aria-hidden>
        {LOG[logIndex]}
      </div>
    </aside>
  );
}
