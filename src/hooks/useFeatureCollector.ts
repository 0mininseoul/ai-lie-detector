"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { createEmptyFeaturePayload } from "@/lib/recording/features";
import type { FeaturePayload } from "@/types/domain";

export type FeatureCollectorPhase = "idle" | "warmup" | "between" | "target" | "complete";
export type FeatureCollectorStatus = "idle" | "collecting" | "ready" | "error";

export type FeatureTimingMarks = {
  recordingStartMs: number | null;
  warmupStartMs: number | null;
  warmupEndMs: number | null;
  targetStartMs: number | null;
  targetEndMs: number | null;
  recordingEndMs: number | null;
};

export type FeaturePayloadBuildResult = {
  payload: FeaturePayload | null;
  error: string | null;
};

const emptyMarks: FeatureTimingMarks = {
  recordingStartMs: null,
  warmupStartMs: null,
  warmupEndMs: null,
  targetStartMs: null,
  targetEndMs: null,
  recordingEndMs: null
};

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function requireMark(marks: FeatureTimingMarks, key: keyof FeatureTimingMarks): number {
  const value = marks[key];
  if (value === null) {
    throw new Error(`${key} is required before collecting features`);
  }

  return value;
}

export function buildFeaturePayloadFromMarks(marks: FeatureTimingMarks): FeaturePayloadBuildResult {
  try {
    const recordingStartMs = requireMark(marks, "recordingStartMs");
    const recordingEndMs = requireMark(marks, "recordingEndMs");
    const warmupStartMs = requireMark(marks, "warmupStartMs");
    const warmupEndMs = requireMark(marks, "warmupEndMs");
    const targetStartMs = requireMark(marks, "targetStartMs");
    const targetEndMs = requireMark(marks, "targetEndMs");

    return {
      payload: createEmptyFeaturePayload({
        durationMs: recordingEndMs - recordingStartMs,
        warmupStartMs: warmupStartMs - recordingStartMs,
        warmupEndMs: warmupEndMs - recordingStartMs,
        targetStartMs: targetStartMs - recordingStartMs,
        targetEndMs: targetEndMs - recordingStartMs
      }),
      error: null
    };
  } catch (error) {
    return {
      payload: null,
      error: error instanceof Error ? error.message : "Unable to collect feature payload"
    };
  }
}

export function useFeatureCollector() {
  const marksRef = useRef<FeatureTimingMarks>(emptyMarks);
  const [marks, setMarks] = useState<FeatureTimingMarks>(emptyMarks);
  const [phase, setPhase] = useState<FeatureCollectorPhase>("idle");
  const [status, setStatus] = useState<FeatureCollectorStatus>("idle");
  const [latestError, setLatestError] = useState<string | null>(null);
  const [payload, setPayload] = useState<FeaturePayload | null>(null);

  const setMark = useCallback((key: keyof FeatureTimingMarks, value = nowMs()) => {
    const nextMarks = { ...marksRef.current, [key]: value };
    marksRef.current = nextMarks;
    setMarks(nextMarks);
    setLatestError(null);
    setPayload(null);
    return value;
  }, []);

  const markRecordingStart = useCallback(() => {
    const value = nowMs();
    const nextMarks = { ...emptyMarks, recordingStartMs: value };
    marksRef.current = nextMarks;
    setMarks(nextMarks);
    setPhase("idle");
    setStatus("collecting");
    setLatestError(null);
    setPayload(null);
    return value;
  }, []);

  const markRecordingEnd = useCallback(() => {
    const value = setMark("recordingEndMs");
    setPhase("complete");
    return value;
  }, [setMark]);

  const markWarmupStart = useCallback(() => {
    const value = setMark("warmupStartMs");
    setPhase("warmup");
    setStatus("collecting");
    return value;
  }, [setMark]);

  const markWarmupEnd = useCallback(() => {
    const value = setMark("warmupEndMs");
    setPhase("between");
    return value;
  }, [setMark]);

  const markTargetStart = useCallback(() => {
    const value = setMark("targetStartMs");
    setPhase("target");
    setStatus("collecting");
    return value;
  }, [setMark]);

  const markTargetEnd = useCallback(() => {
    const value = setMark("targetEndMs");
    setPhase("complete");
    return value;
  }, [setMark]);

  const buildPayload = useCallback(() => {
    const result = buildFeaturePayloadFromMarks(marksRef.current);
    setPayload(result.payload);
    setLatestError(result.error);
    setStatus(result.payload ? "ready" : "error");
    return result;
  }, []);

  const reset = useCallback(() => {
    marksRef.current = emptyMarks;
    setMarks(emptyMarks);
    setPhase("idle");
    setStatus("idle");
    setLatestError(null);
    setPayload(null);
  }, []);

  const canBuildPayload = useMemo(
    () => Object.values(marks).every((value) => value !== null),
    [marks]
  );

  return {
    phase,
    status,
    marks,
    payload,
    latestError,
    canBuildPayload,
    markRecordingStart,
    markRecordingEnd,
    markWarmupStart,
    markWarmupEnd,
    markTargetStart,
    markTargetEnd,
    buildPayload,
    reset
  };
}
