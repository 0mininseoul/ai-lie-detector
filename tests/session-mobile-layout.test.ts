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

  it("layers mobile guidance over the camera instead of below it", () => {
    const titleBlock = selectorBlock(".titleBlock");
    const checkGrid = selectorBlock(".checkGrid");

    expect(titleBlock).toContain("grid-area: video");
    expect(titleBlock).toContain("z-index: 6");
    expect(checkGrid).toContain("position: absolute");
    expect(checkGrid).toContain("pointer-events: none");
  });

  it("keeps mobile action controls anchored over the lower camera edge", () => {
    const controlColumn = selectorBlock(".controlColumn");

    expect(controlColumn).toContain("grid-area: video");
    expect(controlColumn).toContain("align-self: end");
    expect(controlColumn).toContain("z-index: 7");
    expect(mobileCss).toContain("max-height: min(42dvh, 300px)");
  });
});
