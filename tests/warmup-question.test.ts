import { describe, expect, it } from "vitest";
import { getWarmupQuestion } from "@/lib/sessions/validation";

describe("getWarmupQuestion", () => {
  it("returns a non-empty warmup prompt", () => {
    expect(getWarmupQuestion().trim().length).toBeGreaterThan(0);
  });

  it("varies across sessions (random pick from a pool)", () => {
    // 6 options over 50 draws — all-identical is astronomically unlikely, so a
    // single value here means randomization regressed to a constant.
    const seen = new Set(Array.from({ length: 50 }, () => getWarmupQuestion()));
    expect(seen.size).toBeGreaterThan(1);
  });
});
