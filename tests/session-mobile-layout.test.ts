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
    expect(videoFrame).toContain("max-height: min(64dvh, 620px)");
    expect(videoFrame).toContain("height: auto");
    expect(videoFrame).not.toContain("height: 100%");
  });

  it("uses a taller camera frame only when answer prompts are overlaid", () => {
    expect(mobileCss).toContain('.stage[data-phase="warmup"]');
    expect(mobileCss).toContain('.stage[data-phase="target"]');
    expect(mobileCss).toContain("aspect-ratio: 9 / 16");
    expect(mobileCss).toContain("max-height: min(84dvh, 740px)");
  });

  it("keeps only the title over the camera and moves guidance below it", () => {
    const titleBlock = selectorBlock(".titleBlock");
    const checkGrid = selectorBlock(".checkGrid");
    const videoHud = selectorBlock(".videoHud");

    expect(titleBlock).toContain("grid-area: video");
    expect(titleBlock).toContain("z-index: 6");
    expect(checkGrid).toContain("position: static");
    expect(checkGrid).toContain("transform: none");
    expect(checkGrid).toContain("pointer-events: none");
    expect(videoHud).toContain("display: none");
  });

  it("keeps mobile action controls below the camera instead of covering faces", () => {
    const stage = selectorBlock(".stage");
    const controlColumn = selectorBlock(".controlColumn");

    expect(stage).toContain("\"video\"");
    expect(stage).toContain("\"controls\"");
    expect(controlColumn).toContain("grid-area: controls");
    expect(controlColumn).toContain("align-self: start");
    expect(controlColumn).not.toContain("z-index: 7");
    expect(mobileCss).toContain("max-height: none");
  });
});
