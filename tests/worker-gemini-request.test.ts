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
    expect(worker).toContain("normalizeGeminiVideoMimeType(videoInput.mimeType)");
    expect(worker).toContain("mimeType: geminiMimeType");
  });

  it("uses Vertex AI service account credentials instead of a Gemini API key", () => {
    expect(worker).not.toContain("GEMINI_API_KEY");
    expect(worker).not.toContain("new GoogleGenAI({ apiKey");
    expect(worker).toContain("GOOGLE_SERVICE_ACCOUNT_KEY_BASE64");
    expect(worker).toContain("buildVertexGenerateUrl");
  });

  it("stages videos over the inline limit in Cloud Storage for Vertex AI fileData", () => {
    expect(worker).not.toContain("Vertex AI inline video limit exceeded");
    expect(worker).toContain("VERTEX_AI_GCS_BUCKET");
    expect(worker).toContain("uploadVertexVideoToGcs");
    expect(worker).toContain("fileData: { fileUri: gcsFileUri");
  });

  it("builds separate warmup and target video parts for Gemini", () => {
    expect(worker).toContain("buildGeminiVideoParts");
    expect(worker).toContain('segment: "warmup"');
    expect(worker).toContain('segment: "target"');
    expect(worker).toContain("...videoPartResults.map((result) => result.part)");
  });

  it("cleans up staged GCS video parts if another video part fails to prepare", () => {
    expect(worker).toContain("Promise.allSettled");
    expect(worker).toContain("vertex_gcs_video_prepare_cleanup_failed");
  });

  it("uses recording timing offsets when the target segment points at the full recording", () => {
    expect(worker).toContain("targetUsesFullRecording");
    expect(worker).toContain("recording.target_start_ms");
    expect(worker).toContain("recording.target_end_ms");
  });
});
