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

function selectorBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`Missing block for ${selector}`);
  return match[1];
}

describe("CountdownRing timing", () => {
  it("does not drive the countdown with requestAnimationFrame", () => {
    // rAF gets starved on iOS when the session screen saturates the main
    // thread (camera + MediaRecorder + 10fps feature sampling), which froze the
    // ring and fired completion late. Guard the call sites (the doc comment may
    // still name the API to explain why it's avoided).
    expect(component).not.toContain("requestAnimationFrame(");
    expect(component).not.toContain("cancelAnimationFrame(");
  });

  it("completes from a real clock so delayed ticks catch up instead of freezing visible seconds", () => {
    expect(component).toContain("setTimeout");
    expect(component).toContain("setInterval");
    expect(component).toContain("Date.now()");
    expect(component).toContain("deadlineMs");
    expect(component).toContain("remainingMs");
    // onComplete must fire exactly once even if timers double up under
    // StrictMode or re-entrancy.
    expect(component).toContain("firedRef");
  });

  it("drains the ring from deadline-derived React state instead of a CSS timeline", () => {
    expect(component).toContain("progressRatio");
    expect(component).toContain("strokeDashoffset");
    expect(component).toContain('data-active={active}');
    expect(component).toContain("--ring-duration");
    expect(component).toContain("{seconds}");
    expect(component).not.toContain("digitSlots");
    expect(component).not.toContain("--digit-delay");
    expect(css).not.toContain("@keyframes ringDrain");
    expect(css).not.toContain("animation-play-state");
    expect(css).not.toContain("@keyframes digitSlot");
  });

  it("keeps the compact question timer numeric-only so the unit cannot overlap", () => {
    const compactUnit = selectorBlock('.ring[data-size="compact"] .unit');
    const digit = selectorBlock(".digit");

    expect(compactUnit).toContain("display: none");
    expect(digit).toContain("letter-spacing: 0");
  });
});
