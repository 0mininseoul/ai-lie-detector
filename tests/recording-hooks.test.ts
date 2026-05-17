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
