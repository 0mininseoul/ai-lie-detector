import type { FeaturePayload } from "@/types/domain";

type SessionTimings = FeaturePayload["session"];

export function createEmptyFeaturePayload(input: SessionTimings): FeaturePayload {
  assertValidSessionTimings(input);

  return {
    version: 1,
    extraction: {
      status: "unavailable",
      notes: ["No local feature samples have been extracted yet; numeric defaults are placeholders, not observed measurements."]
    },
    session: {
      durationMs: input.durationMs,
      warmupStartMs: input.warmupStartMs,
      warmupEndMs: input.warmupEndMs,
      targetStartMs: input.targetStartMs,
      targetEndMs: input.targetEndMs
    },
    videoQuality: {
      faceVisibleRatio: 0,
      avgBrightness: 0,
      motionBlurScore: 0,
      droppedFrameRatio: 0
    },
    face: {
      samplesPerSecond: 0,
      blinkRateBySegment: [],
      headPoseVarianceBySegment: [],
      mouthMovementBySegment: [],
      faceStabilityBySegment: []
    },
    gaze: {
      gazeStabilityBySegment: [],
      screenAttentionBySegment: []
    },
    audio: {
      speechDetected: false,
      responseLatencyMsByQuestion: [],
      pitchVarianceBySegment: [],
      energyVarianceBySegment: [],
      pauseRatioBySegment: []
    },
    rppg: {
      quality: "unusable",
      bpmEstimateBySegment: [],
      signalVarianceBySegment: []
    }
  };
}

export function assertValidSessionTimings(input: SessionTimings) {
  const entries = Object.entries(input);
  for (const [key, value] of entries) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(`${key} must be a finite non-negative number`);
    }
  }

  if (input.durationMs <= 0) {
    throw new Error("durationMs must be greater than 0");
  }

  if (input.warmupEndMs <= input.warmupStartMs) {
    throw new Error("warmup segment must have positive duration");
  }

  if (input.targetEndMs <= input.targetStartMs) {
    throw new Error("target segment must have positive duration");
  }

  if (input.warmupEndMs > input.targetStartMs) {
    throw new Error("warmup segment must end before target segment starts");
  }

  if (input.targetEndMs > input.durationMs) {
    throw new Error("target segment cannot exceed recording duration");
  }
}
