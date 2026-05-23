import { describe, expect, it } from "vitest";
import { normalizeGeminiVideoMimeType } from "@/lib/gemini/mime";

describe("Gemini video MIME normalization", () => {
  it("strips browser recorder codec parameters before sending video to Gemini", () => {
    expect(normalizeGeminiVideoMimeType("video/mp4; codecs=avc1.42000a,mp4a.40.2")).toBe("video/mp4");
    expect(normalizeGeminiVideoMimeType("video/webm; codecs=vp09.00.10.08,opus")).toBe("video/webm");
  });

  it("falls back to a supported video MIME type", () => {
    expect(normalizeGeminiVideoMimeType("")).toBe("video/mp4");
    expect(normalizeGeminiVideoMimeType("application/mp4")).toBe("video/mp4");
  });
});
