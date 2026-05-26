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
        r2Key: "recordings/session-1.webm",
        mimeType: "video/webm",
        byteSize: 100_000,
        ...validTimings,
        warmupEndMs: 5_000,
        targetStartMs: 4_000,
        featurePayload: validFeaturePayload
      })
    ).toThrow("warmup segment must end before target segment starts");

    expect(() =>
      parseCompleteUploadInput({
        r2Key: "recordings/session-1.webm",
        mimeType: "video/webm",
        byteSize: 100_000,
        ...validTimings,
        targetEndMs: 12_000,
        featurePayload: validFeaturePayload
      })
    ).toThrow("target segment cannot exceed recording duration");
  });

  it("rejects complete-upload feature payloads whose session timings do not match the recording", () => {
    expect(() =>
      parseCompleteUploadInput({
        r2Key: "recordings/session-1.webm",
        mimeType: "video/webm",
        byteSize: 100_000,
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
    expect(() => assertR2KeyMatchesSession("recordings/other-session/capture.webm", sessionId)).toThrow(
      "r2Key must belong to the session"
    );
  });
});
