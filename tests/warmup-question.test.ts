import { describe, expect, it } from "vitest";
import { getWarmupQuestion } from "@/lib/sessions/validation";

describe("getWarmupQuestion", () => {
  it("returns a non-empty warmup prompt", () => {
    expect(getWarmupQuestion().trim().length).toBeGreaterThan(0);
  });

  it("varies across sessions (random pick from a pool)", () => {
    // Over 50 draws, all-identical is astronomically unlikely for any pool of
    // 2+, so a single distinct value here means randomization regressed to a
    // constant.
    const seen = new Set(Array.from({ length: 50 }, () => getWarmupQuestion()));
    expect(seen.size).toBeGreaterThan(1);
  });
});
