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

  it("completes on a single deterministic timer without rerendering during the active animation", () => {
    expect(component).toContain("setTimeout");
    expect(component).not.toContain("setInterval");
    // onComplete must fire exactly once even if timers double up under
    // StrictMode or re-entrancy.
    expect(component).toContain("firedRef");
  });

  it("drains the ring and visible digits on the CSS animation timeline", () => {
    expect(css).toContain("@keyframes ringDrain");
    expect(css).toContain("@keyframes digitSlot");
    expect(css).toContain("animation-play-state");
    expect(component).toContain('data-active={active}');
    expect(component).toContain("--ring-duration");
    expect(component).toContain("digitSlots");
    expect(component).toContain("--digit-delay");
  });

  it("keeps the compact question timer numeric-only so the unit cannot overlap", () => {
    const compactUnit = selectorBlock('.ring[data-size="compact"] .unit');
    const digit = selectorBlock(".digit");

    expect(compactUnit).toContain("display: none");
    expect(digit).toContain("letter-spacing: 0");
  });
});
