"use client";

import { useEffect, useRef, useState } from "react";

/*
 * Voice-activity-based end-of-utterance detector.
 *
 *   1. Open an AudioContext + AnalyserNode on the live mic stream.
 *   2. Sample RMS at ~30Hz.
 *   3. Once RMS stays above `speechThreshold` for at least `minSpeechMs`,
 *      mark "speech detected".
 *   4. After speech is detected, once RMS falls below the threshold for
 *      at least `silenceMs` continuous milliseconds, fire `onSpeechEnd()`.
 *   5. A `maxRecordingMs` safety cap fires `onSpeechEnd()` even if the
 *      threshold never settles.
 *
 * The detector is *fire-once* per session — it cleans up on unmount and
 * never invokes the callback more than once.
 */

export type SpeechDetectorStatus = "listening" | "speaking" | "ended";

type Options = {
  stream: MediaStream | null;
  active: boolean;
  speechThreshold?: number;
  silenceMs?: number;
  minSpeechMs?: number;
  maxRecordingMs?: number;
  onSpeechEnd: () => void;
};

export function useEndOfSpeechDetector({
  stream,
  active,
  speechThreshold = 0.018,
  silenceMs = 900,
  minSpeechMs = 1200,
  maxRecordingMs = 30000,
  onSpeechEnd
}: Options) {
  const [status, setStatus] = useState<SpeechDetectorStatus>("listening");
  const firedRef = useRef(false);
  const onEndRef = useRef(onSpeechEnd);

  useEffect(() => {
    onEndRef.current = onSpeechEnd;
  }, [onSpeechEnd]);

  useEffect(() => {
    if (!active) {
      firedRef.current = false;
      setStatus("listening");
      return;
    }

    if (!stream || !stream.getAudioTracks().length) {
      // No audio track — fail gracefully and let the manual fallback handle it.
      return;
    }

    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) return;

    let cancelled = false;
    const ctx = new AudioContextCtor();
    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    try {
      source = ctx.createMediaStreamSource(stream);
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.1;
      source.connect(analyser);
    } catch {
      void ctx.close().catch(() => undefined);
      return;
    }

    const buffer = new Float32Array(analyser.fftSize);
    const startedAt = performance.now();
    let speechStartedAt: number | null = null;
    let lastSpeechAt = performance.now();
    let raf = 0;

    const tick = () => {
      if (cancelled || !analyser) return;
      analyser.getFloatTimeDomainData(buffer);
      let sumSquares = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = buffer[i];
        sumSquares += v * v;
      }
      const rms = Math.sqrt(sumSquares / buffer.length);
      const now = performance.now();

      if (rms > speechThreshold) {
        if (speechStartedAt === null) {
          speechStartedAt = now;
        }
        lastSpeechAt = now;
        if (status !== "speaking" && speechStartedAt !== null && now - speechStartedAt >= 240) {
          setStatus("speaking");
        }
      }

      if (speechStartedAt !== null) {
        const speechDuration = lastSpeechAt - speechStartedAt;
        const silenceDuration = now - lastSpeechAt;
        if (speechDuration >= minSpeechMs && silenceDuration >= silenceMs) {
          fire();
          return;
        }
      }

      if (now - startedAt >= maxRecordingMs) {
        fire();
        return;
      }

      raf = requestAnimationFrame(tick);
    };

    const fire = () => {
      if (firedRef.current) return;
      firedRef.current = true;
      cancelled = true;
      setStatus("ended");
      try {
        onEndRef.current();
      } catch {
        // Caller is responsible for handling its own errors.
      }
    };

    raf = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      try {
        source?.disconnect();
      } catch {
        // ignore
      }
      void ctx.close().catch(() => undefined);
    };
  }, [active, stream, speechThreshold, silenceMs, minSpeechMs, maxRecordingMs, status]);

  return { status };
}
