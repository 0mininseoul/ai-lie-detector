import { describe, expect, it } from "vitest";
import {
  analysisStaleMs,
  analysisTimeoutErrorCode,
  isAnalysisStale
} from "@/lib/sessions/analysis-timeout";

describe("analysis timeout guard", () => {
  it("only expires sessions that are still analyzing past the stale window", () => {
    const now = Date.parse("2026-05-23T07:20:00.000Z");

    expect(isAnalysisStale("analyzing", new Date(now - analysisStaleMs - 1).toISOString(), now)).toBe(true);
    expect(isAnalysisStale("analyzing", new Date(now - analysisStaleMs + 1).toISOString(), now)).toBe(false);
    expect(isAnalysisStale("uploaded", new Date(now - analysisStaleMs - 1).toISOString(), now)).toBe(false);
    expect(isAnalysisStale("complete", new Date(now - analysisStaleMs - 1).toISOString(), now)).toBe(false);
    expect(isAnalysisStale("analyzing", null, now)).toBe(false);
  });

  it("uses a stable error code for client copy and Axiom queries", () => {
    expect(analysisTimeoutErrorCode).toBe("analysis_timeout");
  });
});
