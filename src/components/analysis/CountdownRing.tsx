"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import styles from "./CountdownRing.module.css";

/*
 * 5-second answer window. SVG ring drains 360°→0° clockwise; the digit at
 * center counts down whole seconds. Color shifts to amber at ≤2s and red
 * at ≤1s. Fires `onComplete()` exactly once when time hits zero.
 *
 * Timing must survive a saturated main thread: this screen runs the camera,
 * MediaRecorder, and a 10fps synchronous feature sampler (canvas diff +
 * MediaPipe FaceLandmarker), which starves requestAnimationFrame on iOS
 * WebKit. So the ring and visible digit slots drain via declarative CSS
 * animations (compositor timeline, no JS per frame — see .progress/.digit).
 * A coarse setInterval only updates tone + aria text, and completion is a
 * single setTimeout that never waits on a paint frame.
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
  const totalSeconds = Math.ceil(durationMs / 1000);
  const digitSlots = Array.from({ length: totalSeconds + 1 }, (_, index) => totalSeconds - index);
  const [seconds, setSeconds] = useState(totalSeconds);
  const firedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (!active) {
      setSeconds(totalSeconds);
      return;
    }

    firedRef.current = false;
    setSeconds(totalSeconds);
    const startedAt = performance.now();

    const interval = window.setInterval(() => {
      const remaining = Math.max(0, durationMs - (performance.now() - startedAt));
      setSeconds(Math.ceil(remaining / 1000));
    }, 200);

    const done = window.setTimeout(() => {
      if (firedRef.current) return;
      firedRef.current = true;
      setSeconds(0);
      onCompleteRef.current();
    }, durationMs);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(done);
    };
  }, [active, durationMs, totalSeconds]);

  const tone = seconds <= 1 ? "danger" : seconds <= 2 ? "warn" : "live";

  const progressStyle = {
    "--ring-duration": `${durationMs}ms`,
    "--ring-circumference": `${CIRCUMFERENCE}`
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
          {digitSlots.map((digit, index) => (
            <strong
              className={styles.digit}
              data-start={index === 0}
              key={digit}
              style={{
                "--digit-delay": `${index * 1000}ms`,
                "--digit-duration": `${digit === 0 ? 160 : Math.min(1000, Math.max(160, durationMs - index * 1000))}ms`
              } as CSSProperties}
            >
              {digit}
            </strong>
          ))}
        </span>
        <span className={styles.unit} aria-hidden>
          sec
        </span>
      </div>
    </div>
  );
}
