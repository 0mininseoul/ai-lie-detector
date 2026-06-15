import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  join(process.cwd(), "src/components/analysis/CountdownRing.tsx"),
  "utf8"
);
const css = readFileSync(
  join(process.cwd(), "src/components/analysis/CountdownRing.module.css"),
  "utf8"
);

describe("CountdownRing timing", () => {
  it("does not drive the countdown with requestAnimationFrame", () => {
    // rAF gets starved on iOS when the session screen saturates the main
    // thread (camera + MediaRecorder + 10fps feature sampling), which froze the
    // ring and fired completion late. Guard the call sites (the doc comment may
    // still name the API to explain why it's avoided).
    expect(component).not.toContain("requestAnimationFrame(");
    expect(component).not.toContain("cancelAnimationFrame(");
  });

  it("completes on a single deterministic timer and ticks the digit coarsely", () => {
    expect(component).toContain("setTimeout");
    expect(component).toContain("setInterval");
    // onComplete must fire exactly once even if timers double up under
    // StrictMode or re-entrancy.
    expect(component).toContain("firedRef");
  });

  it("drains the ring on the CSS animation timeline, not React state per frame", () => {
    expect(css).toContain("@keyframes ringDrain");
    expect(css).toContain("animation-play-state");
    expect(component).toContain('data-active={active}');
    expect(component).toContain("--ring-duration");
  });
});
