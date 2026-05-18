"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import type { LiveFaceBox } from "@/hooks/useFeatureCollector";
import styles from "./LiveAnalysisHud.module.css";

/*
 * Forensic-style heads-up display. The face mesh container is positioned
 * over the actual detected face in real time — useFeatureCollector writes
 * the latest bounding box to `liveFaceBoxRef`, and we use a single
 * requestAnimationFrame loop to project it onto the mirrored video frame.
 * Side metrics + waveform are decorative and update on a slow timer.
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

type HudProps = {
  active?: boolean;
  faceBoxRef?: MutableRefObject<LiveFaceBox | null>;
  mirrored?: boolean;
};

export function LiveAnalysisHud({ active = true, faceBoxRef, mirrored = true }: HudProps) {
  const [tick, setTick] = useState(0);
  const [latencyMs, setLatencyMs] = useState(48);
  const [frameIndex, setFrameIndex] = useState(0);

  const meshTrackerRef = useRef<HTMLDivElement | null>(null);
  const meshFoundRef = useRef(false);

  // Slow metrics + latency tick
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

  // Per-frame: move the face mesh container to track the detected face box.
  useEffect(() => {
    if (!active || !faceBoxRef) return;
    let raf = 0;
    const loop = () => {
      const el = meshTrackerRef.current;
      const box = faceBoxRef.current;
      if (el) {
        if (box) {
          meshFoundRef.current = true;
          // Camera frame is shown mirrored (transform: scaleX(-1)). The
          // landmarks are in the *unmirrored* coordinate system, so flip X
          // for visual placement.
          const x = mirrored ? 1 - box.x - box.width : box.x;
          el.style.left = `${(x * 100).toFixed(2)}%`;
          el.style.top = `${(box.y * 100).toFixed(2)}%`;
          el.style.width = `${(box.width * 100).toFixed(2)}%`;
          el.style.height = `${(box.height * 100).toFixed(2)}%`;
          el.style.opacity = "1";
        } else if (meshFoundRef.current) {
          // Hide the mesh when we lose tracking instead of leaving it stuck.
          el.style.opacity = "0";
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [active, faceBoxRef, mirrored]);

  const metrics: Metric[] = useMemo(() => {
    void tick;
    return SIDE_METRICS_SEED.map((m) => ({
      label: m.label,
      value: m.format(randomInRange(m.min, m.max))
    }));
  }, [tick]);

  const hasTracking = Boolean(faceBoxRef);

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

      {hasTracking ? (
        <div ref={meshTrackerRef} className={styles.meshTracker} style={{ opacity: 0 }}>
          <svg
            className={styles.faceMesh}
            viewBox="0 0 100 130"
            preserveAspectRatio="none"
          >
            <defs>
              <radialGradient id="hud-eye-glow" cx="0.5" cy="0.5" r="0.6">
                <stop offset="0%" stopColor="currentColor" stopOpacity="0.45" />
                <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
              </radialGradient>
            </defs>

            {/* face outline + grid */}
            <ellipse cx="50" cy="65" rx="49" ry="63" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
            <path d="M2 65 Q 50 130 98 65" fill="none" stroke="currentColor" strokeWidth="0.4" opacity="0.35" />
            <path d="M8 30 Q 50 6 92 30" fill="none" stroke="currentColor" strokeWidth="0.4" opacity="0.28" />
            <line x1="50" y1="6" x2="50" y2="124" stroke="currentColor" strokeWidth="0.3" opacity="0.28" />
            <line x1="4" y1="48" x2="96" y2="48" stroke="currentColor" strokeWidth="0.3" opacity="0.24" />

            {/* eye tracking boxes */}
            <rect x="18" y="40" width="22" height="14" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.85" />
            <rect x="60" y="40" width="22" height="14" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.85" />
            <circle cx="29" cy="47" r="4" fill="url(#hud-eye-glow)" />
            <circle cx="71" cy="47" r="4" fill="url(#hud-eye-glow)" />
            <circle cx="29" cy="47" r="1.1" fill="currentColor" />
            <circle cx="71" cy="47" r="1.1" fill="currentColor" />

            {/* nose + mouth */}
            <circle cx="50" cy="62" r="0.7" fill="currentColor" opacity="0.7" />
            <circle cx="50" cy="72" r="0.7" fill="currentColor" opacity="0.7" />
            <rect x="32" y="84" width="36" height="12" fill="none" stroke="currentColor" strokeWidth="0.55" opacity="0.7" />
            <line x1="32" y1="90" x2="68" y2="90" stroke="currentColor" strokeWidth="0.35" opacity="0.4" />

            {/* landmark cloud */}
            <g fill="currentColor" opacity="0.85">
              <circle cx="26" cy="18" r="0.5" />
              <circle cx="40" cy="12" r="0.5" />
              <circle cx="60" cy="12" r="0.5" />
              <circle cx="74" cy="18" r="0.5" />
              <circle cx="10" cy="56" r="0.5" />
              <circle cx="90" cy="56" r="0.5" />
              <circle cx="14" cy="80" r="0.5" />
              <circle cx="86" cy="80" r="0.5" />
              <circle cx="20" cy="104" r="0.5" />
              <circle cx="34" cy="116" r="0.5" />
              <circle cx="50" cy="120" r="0.5" />
              <circle cx="66" cy="116" r="0.5" />
              <circle cx="80" cy="104" r="0.5" />
              <circle cx="50" cy="40" r="0.4" />
              <circle cx="50" cy="55" r="0.4" />
              <circle cx="38" cy="98" r="0.4" />
              <circle cx="62" cy="98" r="0.4" />
            </g>

            {/* scanline */}
            <rect className={styles.scanline} x="0" y="0" width="100" height="1.4" fill="currentColor" opacity="0.5" />
          </svg>
        </div>
      ) : null}

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
