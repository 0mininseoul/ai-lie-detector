import { describe, expect, it } from "vitest";
import { hasStandaloneMp4Initialization } from "@/lib/recording/mp4";

describe("hasStandaloneMp4Initialization", () => {
  it("accepts an MP4 init segment with ftyp and moov boxes", () => {
    const bytes = new Uint8Array([
      0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70,
      0x69, 0x73, 0x6f, 0x6d, 0, 0, 0, 0,
      0, 0, 0, 8, 0x6d, 0x6f, 0x6f, 0x76
    ]);

    expect(hasStandaloneMp4Initialization(bytes)).toBe(true);
  });

  it("rejects a fragmented MP4 media segment that starts at moof", () => {
    const bytes = new Uint8Array([
      0, 0, 3, 148, 0x6d, 0x6f, 0x6f, 0x66,
      0, 0, 0, 16, 0x6d, 0x66, 0x68, 0x64
    ]);

    expect(hasStandaloneMp4Initialization(bytes)).toBe(false);
  });
});
