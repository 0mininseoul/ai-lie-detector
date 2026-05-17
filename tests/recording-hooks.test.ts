import { describe, expect, it } from "vitest";
import { buildFeaturePayloadFromMarks } from "@/hooks/useFeatureCollector";

describe("buildFeaturePayloadFromMarks", () => {
  it("builds an unavailable feature payload from valid phase marks", () => {
    const result = buildFeaturePayloadFromMarks({
      recordingStartMs: 100,
      warmupStartMs: 100,
      warmupEndMs: 1_100,
      targetStartMs: 1_200,
      targetEndMs: 2_700,
      recordingEndMs: 2_700
    });

    expect(result.error).toBeNull();
    expect(result.payload?.session).toEqual({
      durationMs: 2_600,
      warmupStartMs: 0,
      warmupEndMs: 1_000,
      targetStartMs: 1_100,
      targetEndMs: 2_600
    });
    expect(result.payload?.extraction.status).toBe("unavailable");
  });

  it("builds partial feature metrics from browser samples", () => {
    const result = buildFeaturePayloadFromMarks(
      {
        recordingStartMs: 100,
        warmupStartMs: 100,
        warmupEndMs: 1_100,
        targetStartMs: 1_200,
        targetEndMs: 2_700,
        recordingEndMs: 2_700
      },
      [
        {
          timestampMs: 200,
          brightness: 0.5,
          motionScore: 0.1,
          audioEnergy: 0.004,
          pitchHz: 0,
          rppgSignal: 0.52,
          faceVisible: true,
          blinkScore: 0.1,
          headPoseProxy: 0.11,
          mouthMovement: 0.08,
          gazeOffset: 0.05
        },
        {
          timestampMs: 500,
          brightness: 0.7,
          motionScore: 0.2,
          audioEnergy: 0.04,
          pitchHz: 210,
          rppgSignal: 0.58,
          faceVisible: true,
          blinkScore: 0.8,
          headPoseProxy: 0.16,
          mouthMovement: 0.12,
          gazeOffset: 0.08
        },
        {
          timestampMs: 1_500,
          brightness: 0.6,
          motionScore: 0.3,
          audioEnergy: 0.05,
          pitchHz: 240,
          rppgSignal: 0.55,
          faceVisible: true,
          blinkScore: 0.2,
          headPoseProxy: 0.24,
          mouthMovement: 0.2,
          gazeOffset: 0.18
        },
        {
          timestampMs: 2_100,
          brightness: 0.4,
          motionScore: 0.2,
          audioEnergy: 0.006,
          pitchHz: 0,
          rppgSignal: 0.5,
          faceVisible: false,
          blinkScore: 0.1,
          headPoseProxy: 0.2,
          mouthMovement: 0.13,
          gazeOffset: 0.22
        }
      ]
    );

    expect(result.error).toBeNull();
    expect(result.payload?.extraction.status).toBe("partial");
    expect(result.payload?.videoQuality.avgBrightness).toBeCloseTo(0.55, 4);
    expect(result.payload?.videoQuality.faceVisibleRatio).toBeCloseTo(0.75, 4);
    expect(result.payload?.audio.speechDetected).toBe(true);
    expect(result.payload?.audio.responseLatencyMsByQuestion).toEqual([
      { question: "warmup", value: 400 },
      { question: "target", value: 300 }
    ]);
    expect(result.payload?.face.blinkRateBySegment).toEqual([
      { segment: "warmup", value: 60 },
      { segment: "target", value: 0 }
    ]);
    expect(result.payload?.rppg.quality).toBe("weak");
  });

  it("returns a useful error when required marks are missing", () => {
    const result = buildFeaturePayloadFromMarks({
      recordingStartMs: 100,
      warmupStartMs: 100,
      warmupEndMs: 1_100,
      targetStartMs: null,
      targetEndMs: 2_700,
      recordingEndMs: 2_700
    });

    expect(result.payload).toBeNull();
    expect(result.error).toBe("targetStartMs is required before collecting features");
  });

  it("returns validation errors for out-of-order phases", () => {
    const result = buildFeaturePayloadFromMarks({
      recordingStartMs: 100,
      warmupStartMs: 100,
      warmupEndMs: 1_500,
      targetStartMs: 1_400,
      targetEndMs: 2_700,
      recordingEndMs: 2_700
    });

    expect(result.payload).toBeNull();
    expect(result.error).toBe("warmup segment must end before target segment starts");
  });
});
