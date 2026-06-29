import { describe, expect, it } from "vitest";
import { assertR2KeyMatchesSession, parseCompleteUploadInput, parseCreateSessionInput } from "@/lib/sessions/validation";
import { createEmptyFeaturePayload } from "@/lib/recording/features";
import { targetQuestionMaxLength } from "@/lib/sessions/question-limits";

const validTimings = {
  durationMs: 10_000,
  warmupStartMs: 0,
  warmupEndMs: 4_000,
  targetStartMs: 4_000,
  targetEndMs: 10_000
};

const validFeaturePayload = createEmptyFeaturePayload(validTimings);
const validSplitRecordings = {
  warmup: {
    r2Key: "recordings/session-1/warmup/capture.webm",
    mimeType: "video/webm",
    byteSize: 50_000,
    durationMs: 4_000
  },
  target: {
    r2Key: "recordings/session-1/target/capture.webm",
    mimeType: "video/webm",
    byteSize: 80_000,
    durationMs: 6_000
  }
};

describe("session API validation", () => {
  it("accepts a valid Korean session question and defaults locale to ko", () => {
    expect(
      parseCreateSessionInput({
        creatorDeviceId: "device-123456",
        targetQuestion: "어제 누구랑 있었어?"
      })
    ).toEqual({
      creatorDeviceId: "device-123456",
      targetQuestion: "어제 누구랑 있었어?",
      locale: "ko"
    });
  });

  it("rejects browser-controlled identity fields", () => {
    expect(() =>
      parseCreateSessionInput({
        creatorDeviceId: "device-123456",
        targetQuestion: "어제 누구랑 있었어?",
        kakaoUserId: "12345"
      })
    ).toThrow();
  });

  it("rejects invalid target questions", () => {
    expect(() =>
      parseCreateSessionInput({
        creatorDeviceId: "device-123456",
        targetQuestion: "왜"
      })
    ).toThrow();

    expect(() =>
      parseCreateSessionInput({
        creatorDeviceId: "device-123456",
        targetQuestion: "x".repeat(targetQuestionMaxLength + 1)
      })
    ).toThrow();
  });

  it("rejects complete-upload timing intervals that violate recording constraints", () => {
    expect(() =>
      parseCompleteUploadInput({
        recordings: validSplitRecordings,
        ...validTimings,
        warmupEndMs: 5_000,
        targetStartMs: 4_000,
        featurePayload: validFeaturePayload
      })
    ).toThrow("warmup segment must end before target segment starts");

    expect(() =>
      parseCompleteUploadInput({
        recordings: validSplitRecordings,
        ...validTimings,
        targetEndMs: 12_000,
        featurePayload: validFeaturePayload
      })
    ).toThrow("target segment cannot exceed recording duration");
  });

  it("accepts split recording uploads while keeping feature timings on the full session timeline", () => {
    expect(
      parseCompleteUploadInput({
        recordings: validSplitRecordings,
        ...validTimings,
        featurePayload: validFeaturePayload
      }).recordings
    ).toEqual(validSplitRecordings);
  });

  it("rejects complete-upload feature payloads whose session timings do not match the full session timeline", () => {
    expect(() =>
      parseCompleteUploadInput({
        recordings: validSplitRecordings,
        ...validTimings,
        featurePayload: createEmptyFeaturePayload({
          ...validTimings,
          targetEndMs: 9_000
        })
      })
    ).toThrow("featurePayload session timings must match upload timings");
  });

  it("requires R2 keys to belong to the session", () => {
    const sessionId = "00000000-0000-4000-8000-000000000001";

    expect(() => assertR2KeyMatchesSession(`recordings/${sessionId}/capture.webm`, sessionId)).not.toThrow();
    expect(() => assertR2KeyMatchesSession(`recordings/${sessionId}/warmup/capture.webm`, sessionId)).not.toThrow();
    expect(() => assertR2KeyMatchesSession(`recordings/${sessionId}/target/capture.webm`, sessionId)).not.toThrow();
    expect(() => assertR2KeyMatchesSession("recordings/other-session/capture.webm", sessionId)).toThrow(
      "r2Key must belong to the session"
    );
  });
});
