import { describe, expect, it } from "vitest";
import { resolveTargetPlaybackTiming } from "@/lib/sessions/playback-timing";

describe("resolveTargetPlaybackTiming", () => {
  it("uses 0-based timing when target segment is a standalone target clip", () => {
    expect(resolveTargetPlaybackTiming({
      recording: {
        r2_key: "recordings/session/target/full.mp4",
        target_start_ms: 6500,
        target_end_ms: 11500
      },
      targetSegment: {
        r2_key: "recordings/session/target/clip.mp4",
        duration_ms: 5000
      }
    })).toEqual({
      targetStartMs: 0,
      targetEndMs: 5000
    });
  });

  it("still uses 0-based timing when a standalone target clip has the same key as recordings", () => {
    expect(resolveTargetPlaybackTiming({
      recording: {
        r2_key: "recordings/session/target/clip.mp4",
        target_start_ms: 6500,
        target_end_ms: 11500
      },
      targetSegment: {
        r2_key: "recordings/session/target/clip.mp4",
        duration_ms: 5000
      }
    })).toEqual({
      targetStartMs: 0,
      targetEndMs: 5000
    });
  });

  it("uses stored target offsets when target segment duration covers the full recording", () => {
    expect(resolveTargetPlaybackTiming({
      recording: {
        r2_key: "recordings/session/target/full.mp4",
        target_start_ms: 6500,
        target_end_ms: 11500
      },
      targetSegment: {
        r2_key: "recordings/session/target/full.mp4",
        duration_ms: 13000
      }
    })).toEqual({
      targetStartMs: 6500,
      targetEndMs: 11500
    });
  });

  it("falls back to legacy recording timing when split segment metadata is unavailable", () => {
    expect(resolveTargetPlaybackTiming({
      recording: {
        r2_key: "recordings/session/legacy.mp4",
        target_start_ms: 6100,
        target_end_ms: 11100
      },
      targetSegment: null
    })).toEqual({
      targetStartMs: 6100,
      targetEndMs: 11100
    });
  });
});
