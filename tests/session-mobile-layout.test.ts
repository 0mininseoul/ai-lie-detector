import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/s/[id]/session.module.css"), "utf8");
const mobileCss = css.slice(css.indexOf("@media (max-width: 1100px)"));

function selectorBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = mobileCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`Missing mobile block for ${selector}`);
  return match[1];
}

describe("session recorder mobile layout", () => {
  it("uses a fullscreen camera layer for setup and answer phases", () => {
    const stage = selectorBlock(".stage");
    const videoFrame = selectorBlock(".videoFrame");

    expect(stage).toContain("position: fixed");
    expect(stage).toContain("display: block");
    expect(videoFrame).toContain("position: fixed");
    expect(mobileCss).toContain("height: 100svh");
    expect(mobileCss).toContain("aspect-ratio: auto");
  });

  it("keeps setup content as camera overlays", () => {
    const titleBlock = selectorBlock(".titleBlock");
    const guidanceCard = selectorBlock(".guidanceCard");
    const videoHud = selectorBlock(".videoHud");

    expect(titleBlock).toContain("position: fixed");
    expect(titleBlock).toContain("z-index: 6");
    expect(guidanceCard).toContain("position: fixed");
    expect(guidanceCard).toContain("width: var(--overlay-width)");
    expect(guidanceCard).toContain("pointer-events: none");
    expect(videoHud).toContain("display: none");
  });

  it("keeps setup action controls below the camera and answer prompts as overlays", () => {
    const stage = selectorBlock(".stage");
    const controlColumn = selectorBlock(".controlColumn");

    expect(stage).toContain("--overlay-width");
    expect(controlColumn).toContain("position: fixed");
    expect(mobileCss).toContain("bottom: max(14px, env(safe-area-inset-bottom))");
    expect(mobileCss).toContain("top: max(16px, env(safe-area-inset-top))");
    expect(mobileCss).toContain("z-index: 7");
  });

  it("fills the mobile camera layer without letterboxing", () => {
    const video = selectorBlock(".videoFrame video");

    expect(video).toContain("object-fit: cover");
    expect(video).toContain("object-position: center center");
  });

  it("keeps the mobile countdown timer in the question card flow", () => {
    const timer = selectorBlock(".questionHeader > :last-child");
    const text = selectorBlock(".questionText");
    const warmupText = selectorBlock('.questionPanel[data-kind="warmup"] .questionText');
    const targetText = selectorBlock('.stage[data-phase="target"] .questionText');

    expect(mobileCss).toContain('"label timer"');
    expect(mobileCss).toContain('"question timer"');
    expect(mobileCss).toContain(".stage[data-phase=\"target\"] .targetPanel");
    expect(mobileCss).toContain('"question question"');
    expect(timer).toContain("grid-area: timer");
    expect(timer).toContain("position: static");
    expect(timer).not.toContain("position: absolute");
    expect(text).toContain("overflow-wrap: anywhere");
    expect(warmupText).toContain("white-space: normal");
    expect(targetText).toContain("white-space: nowrap");
    expect(targetText).toContain("text-overflow: ellipsis");
  });
});
