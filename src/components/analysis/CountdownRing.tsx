"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./CountdownRing.module.css";

/*
 * 5-second answer window. SVG ring drains 360°→0° clockwise; the digit at
 * center counts down whole seconds. Color shifts to amber at ≤2s and red
 * at ≤1s. Fires `onComplete()` exactly once when time hits zero.
 *
 * Implementation uses requestAnimationFrame instead of setInterval so the
 * ring animation stays smooth even on slow tabs, and the final-tick race
 * (timer = 0 before onComplete fires) is impossible.
 */

type Props = {
  durationMs?: number;
  active: boolean;
  onComplete: () => void;
  size?: "default" | "compact";
};

const RADIUS = 56;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function CountdownRing({ durationMs = 5000, active, onComplete, size = "default" }: Props) {
  const [remainingMs, setRemainingMs] = useState(durationMs);
  const firedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!active) {
      setRemainingMs(firedRef.current ? 0 : durationMs);
      return;
    }

    firedRef.current = false;
    let raf = 0;
    const startedAt = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startedAt;
      const remaining = Math.max(0, durationMs - elapsed);
      setRemainingMs(remaining);
      if (remaining > 0) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (firedRef.current) return;
      firedRef.current = true;
      try {
        onCompleteRef.current();
      } catch {
        // Caller is responsible for surfacing its own errors.
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, durationMs]);

  const progress = Math.max(0, Math.min(1, remainingMs / durationMs));
  const offset = CIRCUMFERENCE * (1 - progress);
  const seconds = Math.ceil(remainingMs / 1000);
  const tone = remainingMs <= 1000 ? "danger" : remainingMs <= 2000 ? "warn" : "live";

  return (
    <div className={styles.ring} data-tone={tone} data-size={size} aria-live="polite">
      <svg viewBox="0 0 128 128" aria-hidden>
        <circle cx="64" cy="64" r={RADIUS} className={styles.track} />
        <circle
          cx="64"
          cy="64"
          r={RADIUS}
          className={styles.progress}
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={offset}
        />
      </svg>
      <div className={styles.center}>
        <strong>{seconds}</strong>
        <span>sec</span>
      </div>
    </div>
  );
}
