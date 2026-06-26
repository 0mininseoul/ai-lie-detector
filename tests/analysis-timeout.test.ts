import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  analysisStaleMs,
  analysisTimeoutErrorCode,
  isAnalysisStale
} from "@/lib/sessions/analysis-timeout";
import {
  isUploadStale,
  uploadStaleMs,
  uploadTimeoutErrorCode
} from "@/lib/sessions/upload-timeout";

const statusRoute = readFileSync(join(process.cwd(), "src/app/api/sessions/[id]/status/route.ts"), "utf8");

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

describe("upload timeout guard", () => {
  it("only expires pre-analysis uploads past the stale window", () => {
    const now = Date.parse("2026-05-23T07:20:00.000Z");

    expect(isUploadStale("created", new Date(now - uploadStaleMs - 1).toISOString(), now)).toBe(true);
    expect(isUploadStale("recording", new Date(now - uploadStaleMs - 1).toISOString(), now)).toBe(true);
    expect(isUploadStale("created", new Date(now - uploadStaleMs + 1).toISOString(), now)).toBe(false);
    expect(isUploadStale("uploaded", new Date(now - uploadStaleMs - 1).toISOString(), now)).toBe(false);
    expect(isUploadStale("analyzing", new Date(now - uploadStaleMs - 1).toISOString(), now)).toBe(false);
    expect(isUploadStale("created", null, now)).toBe(false);
  });

  it("uses a stable upload timeout code for client copy and Axiom queries", () => {
    expect(uploadTimeoutErrorCode).toBe("upload_timeout");
  });

  it("status polling can fail stale uploads instead of waiting forever", () => {
    expect(statusRoute).toContain("isUploadStale");
    expect(statusRoute).toContain("uploadTimeoutErrorCode");
    expect(statusRoute).toContain("upload_marked_stale");
  });
});
