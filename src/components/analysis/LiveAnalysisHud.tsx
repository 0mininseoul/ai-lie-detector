"use client";

import { useEffect, useMemo, useState } from "react";
import styles from "./LiveAnalysisHud.module.css";

/*
 * Mediapipe-style heads-up display rendered as an absolute overlay over
 * the video frame. Nothing here drives real analysis — the actual signal
 * extraction happens in useFeatureCollector. This is a *visual* layer that
 * makes the experience feel forensic while the user answers the target
 * question. Numbers drift smoothly so the panel feels alive.
 */

type Metric = {
  label: string;
  value: string;
};

const SIDE_METRICS_SEED: Array<{ label: string; min: number; max: number; format: (n: number) => string }> = [
  { label: "BLINK_RATE", min: 9, max: 22, format: (n) => `${n.toFixed(0)}/min` },
  { label: "GAZE_DEV", min: 0.12, max: 0.46, format: (n) => n.toFixed(2) },
  { label: "HEAD_POSE", min: 4, max: 18, format: (n) => `±${n.toFixed(1)}°` },
  { label: "AU01", min: 0.08, max: 0.7, format: (n) => n.toFixed(2) },
  { label: "AU04", min: 0.02, max: 0.42, format: (n) => n.toFixed(2) },
  { label: "F0_STD", min: 8, max: 32, format: (n) => `${n.toFixed(1)}Hz` },
  { label: "JITTER", min: 0.4, max: 2.6, format: (n) => `${n.toFixed(2)}%` }
];

function randomInRange(min: number, max: number) {
  return min + Math.random() * (max - min);
}

export function LiveAnalysisHud({ active = true }: { active?: boolean }) {
  const [tick, setTick] = useState(0);
  const [latencyMs, setLatencyMs] = useState(48);
  const [frameIndex, setFrameIndex] = useState(0);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setTick((t) => t + 1), 720);
    return () => window.clearInterval(id);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => {
      setLatencyMs(38 + Math.random() * 22);
      setFrameIndex((prev) => prev + Math.floor(28 + Math.random() * 6));
    }, 360);
    return () => window.clearInterval(id);
  }, [active]);

  const metrics: Metric[] = useMemo(() => {
    void tick;
    return SIDE_METRICS_SEED.map((m) => ({
      label: m.label,
      value: m.format(randomInRange(m.min, m.max))
    }));
  }, [tick]);

  return (
    <div className={styles.hud} aria-hidden>
      <div className={styles.cornerTl} />
      <div className={styles.cornerTr} />
      <div className={styles.cornerBl} />
      <div className={styles.cornerBr} />

      <div className={styles.topBar}>
        <span className={styles.topChip} data-live>
          <i className={styles.liveDot} />
          LIVE · MULTIMODAL
        </span>
        <span className={styles.topChip}>FACE_MESH · 478pt</span>
        <span className={styles.topChip}>FRAME · {String(frameIndex).padStart(5, "0")}</span>
      </div>

      <svg
        className={styles.faceMesh}
        viewBox="0 0 100 130"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="hud-eye-glow" cx="0.5" cy="0.5" r="0.6">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>

        {/* skull oval */}
        <ellipse cx="50" cy="68" rx="34" ry="48" fill="none" stroke="currentColor" strokeWidth="0.45" opacity="0.5" />
        {/* jaw arc */}
        <path d="M16 68 Q 50 124 84 68" fill="none" stroke="currentColor" strokeWidth="0.35" opacity="0.4" />
        {/* forehead arc */}
        <path d="M22 38 Q 50 24 78 38" fill="none" stroke="currentColor" strokeWidth="0.35" opacity="0.32" />
        {/* vertical center axis */}
        <line x1="50" y1="32" x2="50" y2="108" stroke="currentColor" strokeWidth="0.28" opacity="0.3" />
        {/* eye horizon */}
        <line x1="20" y1="56" x2="80" y2="56" stroke="currentColor" strokeWidth="0.28" opacity="0.28" />

        {/* eyes */}
        <rect x="28" y="51" width="14" height="9" fill="none" stroke="currentColor" strokeWidth="0.55" opacity="0.85" />
        <rect x="58" y="51" width="14" height="9" fill="none" stroke="currentColor" strokeWidth="0.55" opacity="0.85" />
        <circle cx="35" cy="55.5" r="2.2" fill="url(#hud-eye-glow)" />
        <circle cx="65" cy="55.5" r="2.2" fill="url(#hud-eye-glow)" />
        <circle cx="35" cy="55.5" r="0.9" fill="currentColor" opacity="0.95" />
        <circle cx="65" cy="55.5" r="0.9" fill="currentColor" opacity="0.95" />

        {/* nose markers */}
        <circle cx="50" cy="65" r="0.6" fill="currentColor" opacity="0.7" />
        <circle cx="50" cy="74" r="0.6" fill="currentColor" opacity="0.7" />

        {/* mouth tracker */}
        <rect x="38" y="84" width="24" height="9" fill="none" stroke="currentColor" strokeWidth="0.45" opacity="0.7" />
        <line x1="38" y1="88.5" x2="62" y2="88.5" stroke="currentColor" strokeWidth="0.3" opacity="0.4" />

        {/* landmark cloud (subset of 478) */}
        <g fill="currentColor" opacity="0.85">
          {/* forehead */}
          <circle cx="38" cy="34" r="0.45" />
          <circle cx="46" cy="30" r="0.45" />
          <circle cx="54" cy="30" r="0.45" />
          <circle cx="62" cy="34" r="0.45" />
          {/* cheek bones */}
          <circle cx="26" cy="62" r="0.5" />
          <circle cx="74" cy="62" r="0.5" />
          <circle cx="30" cy="78" r="0.45" />
          <circle cx="70" cy="78" r="0.45" />
          {/* nose ridge */}
          <circle cx="50" cy="46" r="0.4" />
          <circle cx="50" cy="54" r="0.4" />
          {/* jaw */}
          <circle cx="34" cy="98" r="0.45" />
          <circle cx="42" cy="104" r="0.45" />
          <circle cx="50" cy="106" r="0.5" />
          <circle cx="58" cy="104" r="0.45" />
          <circle cx="66" cy="98" r="0.45" />
        </g>

        {/* scanline */}
        <rect className={styles.scanline} x="14" y="0" width="72" height="1.4" fill="currentColor" opacity="0.55" />
      </svg>

      <ul className={styles.sideMetrics}>
        {metrics.map((m) => (
          <li key={m.label}>
            <span>{m.label}</span>
            <b>{m.value}</b>
          </li>
        ))}
      </ul>

      <div className={styles.bottomBar}>
        <div className={styles.waveform}>
          {Array.from({ length: 22 }).map((_, index) => (
            <i key={index} style={{ ["--d" as string]: `${index * 60}ms` }} />
          ))}
        </div>
        <span className={styles.latency}>
          LATENCY · {Math.round(latencyMs)}ms
        </span>
      </div>
    </div>
  );
}
