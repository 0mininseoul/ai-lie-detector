import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const worker = readFileSync(join(process.cwd(), "worker/src/index.ts"), "utf8");

describe("worker Gemini video request", () => {
  it("does not attach part-level mediaResolution to inline video parts", () => {
    expect(worker).not.toContain("PartMediaResolutionLevel");
    expect(worker).not.toContain("mediaResolution,");
  });

  it("normalizes recorder MIME types before passing video to Gemini", () => {
    expect(worker).toContain("normalizeGeminiVideoMimeType(recording.mime_type)");
    expect(worker).toContain("mimeType: geminiMimeType");
  });
});
