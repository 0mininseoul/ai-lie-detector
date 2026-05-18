import type { FeaturePayload } from "@/types/domain";

type SessionTimings = FeaturePayload["session"];
type QuestionType = "warmup" | "target";

export type FeatureSample = {
  timestampMs: number;
  brightness?: number;
  motionScore?: number;
  audioEnergy?: number;
  pitchHz?: number;
  rppgSignal?: number;
  faceVisible?: boolean;
  blinkScore?: number;
  headPoseProxy?: number;
  mouthMovement?: number;
  gazeOffset?: number;
};

type RelativeFeatureSample = Omit<FeatureSample, "timestampMs"> & {
  elapsedMs: number;
};

const speechEnergyThreshold = 0.018;

export function createEmptyFeaturePayload(input: SessionTimings): FeaturePayload {
  return createFeaturePayload(input, []);
}

export function createFeaturePayload(input: SessionTimings, samples: RelativeFeatureSample[]): FeaturePayload {
  assertValidSessionTimings(input);

  if (samples.length === 0) {
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

  const videoSamples = samples.filter((sample) => hasAnyNumber(sample, ["brightness", "motionScore", "rppgSignal"]));
  const audioSamples = samples.filter((sample) => hasFiniteNumber(sample.audioEnergy));
  const faceSamples = samples.filter((sample) => sample.faceVisible !== undefined || hasAnyNumber(sample, ["blinkScore", "headPoseProxy", "mouthMovement"]));
  const segments = buildSegments(input);

  return {
    version: 1,
    extraction: {
      status: "partial",
      notes: buildExtractionNotes({ videoSamples, audioSamples, faceSamples })
    },
    session: {
      durationMs: input.durationMs,
      warmupStartMs: input.warmupStartMs,
      warmupEndMs: input.warmupEndMs,
      targetStartMs: input.targetStartMs,
      targetEndMs: input.targetEndMs
    },
    videoQuality: {
      faceVisibleRatio: ratio(faceSamples, (sample) => sample.faceVisible === true),
      avgBrightness: average(pluck(samples, "brightness")),
      motionBlurScore: average(pluck(samples, "motionScore")),
      droppedFrameRatio: estimateDroppedFrameRatio(input.durationMs, videoSamples.length)
    },
    face: {
      samplesPerSecond: round(videoSamples.length / (input.durationMs / 1000), 4),
      blinkRateBySegment: segments.map((segment) => ({
        segment: segment.name,
        value: round(countRisingEdges(samplesForSegment(samples, segment), "blinkScore", 0.5) * (60_000 / segment.durationMs), 4)
      })),
      headPoseVarianceBySegment: segmentVariance(segments, samples, "headPoseProxy"),
      mouthMovementBySegment: segmentVariance(segments, samples, "mouthMovement"),
      faceStabilityBySegment: segments.map((segment) => ({
        segment: segment.name,
        value: round(clamp01(1 - average(pluck(samplesForSegment(samples, segment), "motionScore"))), 4)
      }))
    },
    gaze: {
      gazeStabilityBySegment: segments.map((segment) => ({
        segment: segment.name,
        value: round(clamp01(1 - variance(pluck(samplesForSegment(samples, segment), "gazeOffset")) * 8), 4)
      })),
      screenAttentionBySegment: segments.map((segment) => {
        const segmentSamples = samplesForSegment(samples, segment).filter((sample) => hasFiniteNumber(sample.gazeOffset));
        return {
          segment: segment.name,
          value: round(ratio(segmentSamples, (sample) => Math.abs(sample.gazeOffset ?? 1) <= 0.18), 4)
        };
      })
    },
    audio: {
      speechDetected: audioSamples.some((sample) => (sample.audioEnergy ?? 0) > speechEnergyThreshold),
      responseLatencyMsByQuestion: segments.map((segment) => ({
        question: segment.name,
        value: estimateResponseLatency(samplesForSegment(samples, segment), segment)
      })),
      pitchVarianceBySegment: segmentVariance(segments, samples, "pitchHz"),
      energyVarianceBySegment: segmentVariance(segments, samples, "audioEnergy"),
      pauseRatioBySegment: segments.map((segment) => {
        const segmentSamples = samplesForSegment(samples, segment).filter((sample) => hasFiniteNumber(sample.audioEnergy));
        return {
          segment: segment.name,
          value: round(ratio(segmentSamples, (sample) => (sample.audioEnergy ?? 0) <= speechEnergyThreshold), 4)
        };
      })
    },
    rppg: {
      quality: estimateRppgQuality(samples),
      bpmEstimateBySegment: segments.map((segment) => ({
        segment: segment.name,
        value: estimateBpm(samplesForSegment(samples, segment))
      })),
      signalVarianceBySegment: segmentVariance(segments, samples, "rppgSignal")
    }
  };
}

export function normalizeFeatureSamples(recordingStartMs: number, samples: FeatureSample[]): RelativeFeatureSample[] {
  return samples
    .map((sample) => ({
      ...sample,
      elapsedMs: sample.timestampMs - recordingStartMs
    }))
    .filter((sample) => Number.isFinite(sample.elapsedMs) && sample.elapsedMs >= 0);
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

function buildSegments(input: SessionTimings) {
  return [
    { name: "warmup" as const, startMs: input.warmupStartMs, endMs: input.warmupEndMs, durationMs: input.warmupEndMs - input.warmupStartMs },
    { name: "target" as const, startMs: input.targetStartMs, endMs: input.targetEndMs, durationMs: input.targetEndMs - input.targetStartMs }
  ];
}

function buildExtractionNotes({
  videoSamples,
  audioSamples,
  faceSamples
}: {
  videoSamples: RelativeFeatureSample[];
  audioSamples: RelativeFeatureSample[];
  faceSamples: RelativeFeatureSample[];
}) {
  const notes = ["Browser-local video/audio feature samples were collected before upload."];
  if (videoSamples.length === 0) notes.push("Video sample metrics were unavailable.");
  if (audioSamples.length === 0) notes.push("Audio energy metrics were unavailable.");
  if (!faceSamples.some((sample) => sample.faceVisible)) {
    notes.push("Face landmark metrics were unavailable or weak; aggregate video/audio proxies are still included.");
  }
  return notes;
}

function hasFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function hasAnyNumber(sample: RelativeFeatureSample, keys: Array<keyof RelativeFeatureSample>) {
  return keys.some((key) => hasFiniteNumber(sample[key]));
}

function pluck(samples: RelativeFeatureSample[], key: keyof RelativeFeatureSample) {
  return samples.map((sample) => sample[key]).filter(hasFiniteNumber);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length, 4);
}

function variance(values: number[]) {
  if (values.length <= 1) return 0;
  const mean = average(values);
  const squared = values.map((value) => (value - mean) ** 2);
  return round(squared.reduce((sum, value) => sum + value, 0) / squared.length, 4);
}

function ratio<T>(items: T[], predicate: (item: T) => boolean) {
  if (items.length === 0) return 0;
  return items.filter(predicate).length / items.length;
}

function samplesForSegment(samples: RelativeFeatureSample[], segment: { startMs: number; endMs: number }) {
  return samples.filter((sample) => sample.elapsedMs >= segment.startMs && sample.elapsedMs <= segment.endMs);
}

function segmentVariance(
  segments: Array<{ name: QuestionType; startMs: number; endMs: number }>,
  samples: RelativeFeatureSample[],
  key: keyof RelativeFeatureSample
) {
  return segments.map((segment) => ({
    segment: segment.name,
    value: variance(pluck(samplesForSegment(samples, segment), key))
  }));
}

function countRisingEdges(samples: RelativeFeatureSample[], key: keyof RelativeFeatureSample, threshold: number) {
  let count = 0;
  let wasAbove = false;

  for (const sample of samples) {
    const value = sample[key];
    const isAbove = hasFiniteNumber(value) && value >= threshold;
    if (isAbove && !wasAbove) count += 1;
    wasAbove = isAbove;
  }

  return count;
}

function estimateResponseLatency(samples: RelativeFeatureSample[], segment: { startMs: number; durationMs: number }) {
  const firstSpeech = samples.find((sample) => (sample.audioEnergy ?? 0) > speechEnergyThreshold);
  if (!firstSpeech) return segment.durationMs;
  return Math.max(0, Math.round(firstSpeech.elapsedMs - segment.startMs));
}

function estimateDroppedFrameRatio(durationMs: number, sampleCount: number) {
  const expectedSamples = Math.max(1, Math.floor(durationMs / 250));
  return round(clamp01(1 - sampleCount / expectedSamples), 4);
}

function estimateRppgQuality(samples: RelativeFeatureSample[]): FeaturePayload["rppg"]["quality"] {
  const rppgSamples = pluck(samples, "rppgSignal");
  if (rppgSamples.length < 3) return "unusable";
  if (rppgSamples.length >= 24 && variance(rppgSamples) > 0.0001) return "good";
  return "weak";
}

function estimateBpm(samples: RelativeFeatureSample[]) {
  const points = samples
    .filter((sample) => hasFiniteNumber(sample.rppgSignal))
    .map((sample) => ({ elapsedMs: sample.elapsedMs, value: sample.rppgSignal as number }));

  if (points.length < 6) return 0;

  const mean = average(points.map((point) => point.value));
  const peaks: number[] = [];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    if (current.value > mean && current.value >= previous.value && current.value > next.value) {
      peaks.push(current.elapsedMs);
    }
  }

  if (peaks.length < 2) return 0;

  const intervals = peaks.slice(1).map((peak, index) => peak - peaks[index]).filter((interval) => interval > 0);
  const bpm = 60_000 / average(intervals);
  return bpm >= 45 && bpm <= 180 ? round(bpm, 2) : 0;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function round(value: number, digits = 4) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
