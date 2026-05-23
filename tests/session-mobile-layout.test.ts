import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/s/[id]/session.module.css"), "utf8");
const mobileCss = css.slice(css.indexOf("@media (max-width: 920px)"));

function selectorBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = mobileCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`Missing mobile block for ${selector}`);
  return match[1];
}

describe("session recorder mobile layout", () => {
  it("bounds the camera stage to a portrait analysis frame", () => {
    const videoFrame = selectorBlock(".videoFrame");

    expect(videoFrame).toContain("aspect-ratio: 3 / 4");
    expect(videoFrame).toContain("max-height: calc(100svh - 242px)");
    expect(videoFrame).toContain("height: auto");
    expect(videoFrame).not.toContain("height: 100%");
  });

  it("uses a fullscreen camera layer when answer prompts are overlaid", () => {
    expect(mobileCss).toContain('.stage[data-phase="warmup"]');
    expect(mobileCss).toContain('.stage[data-phase="target"]');
    expect(mobileCss).toContain("position: fixed");
    expect(mobileCss).toContain("height: 100svh");
    expect(mobileCss).toContain("aspect-ratio: auto");
  });

  it("keeps only the title over the camera and moves guidance below it", () => {
    const titleBlock = selectorBlock(".titleBlock");
    const guidanceCard = selectorBlock(".guidanceCard");
    const videoHud = selectorBlock(".videoHud");

    expect(titleBlock).toContain("grid-area: video");
    expect(titleBlock).toContain("z-index: 6");
    expect(guidanceCard).toContain("width: var(--mobile-camera-width)");
    expect(guidanceCard).toContain("pointer-events: none");
    expect(videoHud).toContain("display: none");
  });

  it("keeps setup action controls below the camera and answer prompts as overlays", () => {
    const stage = selectorBlock(".stage");
    const controlColumn = selectorBlock(".controlColumn");

    expect(stage).toContain("\"video\"");
    expect(stage).toContain("\"controls\"");
    expect(controlColumn).toContain("grid-area: controls");
    expect(controlColumn).toContain("align-self: start");
    expect(mobileCss).toContain("top: max(8px, env(safe-area-inset-top))");
    expect(mobileCss).toContain("z-index: 7");
  });

  it("fills the portrait camera frame on mobile instead of showing a landscape strip", () => {
    const video = selectorBlock(".videoFrame video");

    expect(video).toContain("object-fit: cover");
    expect(video).toContain("object-position: center center");
  });
});
