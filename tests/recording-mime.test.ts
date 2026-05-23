import { describe, expect, it } from "vitest";
import { candidateMimeTypes, pickSupportedMimeType } from "@/lib/recording/mime";
import { createEmptyFeaturePayload } from "@/lib/recording/features";

describe("recording mime helpers", () => {
  it("lists MediaRecorder candidates in preference order", () => {
    expect(candidateMimeTypes).toEqual([
      "video/mp4;codecs=h264,aac",
      "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
      "video/mp4",
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
      "video/webm"
    ]);
  });

  it("returns the first supported MIME type", () => {
    const supported = new Set(["video/webm", "video/mp4"]);

    expect(pickSupportedMimeType((mimeType) => supported.has(mimeType))).toBe("video/mp4");
  });

  it("returns an empty string when no candidates are supported", () => {
    expect(pickSupportedMimeType(() => false)).toBe("");
  });
});

describe("createEmptyFeaturePayload", () => {
  it("returns a complete neutral FeaturePayload", () => {
    expect(
      createEmptyFeaturePayload({
        durationMs: 10_000,
        warmupStartMs: 0,
        warmupEndMs: 4_000,
        targetStartMs: 4_000,
        targetEndMs: 10_000
      })
    ).toEqual({
      version: 1,
      extraction: {
        status: "unavailable",
        notes: ["No local feature samples have been extracted yet; numeric defaults are placeholders, not observed measurements."]
      },
      session: {
        durationMs: 10_000,
        warmupStartMs: 0,
        warmupEndMs: 4_000,
        targetStartMs: 4_000,
        targetEndMs: 10_000
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
    });
  });

  it("rejects invalid timing inputs", () => {
    expect(() =>
      createEmptyFeaturePayload({
        durationMs: 10_000,
        warmupStartMs: 0,
        warmupEndMs: 4_000,
        targetStartMs: 4_000,
        targetEndMs: 12_000
      })
    ).toThrow("target segment cannot exceed recording duration");

    expect(() =>
      createEmptyFeaturePayload({
        durationMs: 10_000,
        warmupStartMs: 0,
        warmupEndMs: 0,
        targetStartMs: 4_000,
        targetEndMs: 10_000
      })
    ).toThrow("warmup segment must have positive duration");
  });
});
