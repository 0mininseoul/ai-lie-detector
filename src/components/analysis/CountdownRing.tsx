"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./CountdownRing.module.css";

/*
 * 5-second answer window. SVG ring drains 360°→0° clockwise; the digit at
 * center counts down whole seconds. Color shifts to amber at ≤2s and red
 * at ≤1s. Fires `onComplete()` exactly once when time hits zero.
 *
 * Timing must survive a saturated main thread: this screen runs the camera,
 * MediaRecorder, and browser-local feature sampling, which can delay timer
 * callbacks on iOS WebKit. Both the visible digit and ring progress are derived
 * from a real deadline. If a tick is delayed, the next tick catches up from
 * Date.now() instead of continuing from a stale visual slot.
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
      setRemainingMs(durationMs);
      return;
    }

    firedRef.current = false;
    setRemainingMs(durationMs);
    const deadlineMs = Date.now() + durationMs;

    const complete = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      setRemainingMs(0);
      onCompleteRef.current();
    };

    const updateRemaining = () => {
      const remainingMs = Math.max(0, deadlineMs - Date.now());
      setRemainingMs(remainingMs);
      if (remainingMs <= 0) complete();
    };

    updateRemaining();
    const tick = window.setInterval(updateRemaining, 100);
    const done = window.setTimeout(updateRemaining, durationMs + 30);

    return () => {
      window.clearInterval(tick);
      window.clearTimeout(done);
    };
  }, [active, durationMs]);

  const seconds = Math.ceil(remainingMs / 1000);
  const tone = seconds <= 1 ? "danger" : seconds <= 2 ? "warn" : "live";
  const progressRatio = durationMs > 0 ? Math.max(0, Math.min(1, remainingMs / durationMs)) : 0;

  const progressStyle = {
    "--ring-duration": `${durationMs}ms`,
    "--ring-circumference": `${CIRCUMFERENCE}`,
    strokeDashoffset: CIRCUMFERENCE * (1 - progressRatio)
  } as CSSProperties;

  return (
    <div className={styles.ring} data-tone={tone} data-size={size} data-active={active} aria-live="polite">
      <svg viewBox="0 0 128 128" aria-hidden>
        <circle cx="64" cy="64" r={RADIUS} className={styles.track} />
        <circle
          cx="64"
          cy="64"
          r={RADIUS}
          className={styles.progress}
          data-active={active}
          strokeDasharray={CIRCUMFERENCE}
          style={progressStyle}
        />
      </svg>
      <div className={styles.center} aria-label={`${seconds}초 남음`}>
        <span className={styles.digits} aria-hidden>
          <strong className={styles.digit}>{seconds}</strong>
        </span>
        <span className={styles.unit} aria-hidden>
          sec
        </span>
      </div>
    </div>
  );
}
