import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const resultTsx = readFileSync(join(process.cwd(), "src/app/result/[id]/ResultExperience.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/app/result/[id]/ResultExperience.module.css"), "utf8");

function selectorBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`Missing block for ${selector}`);
  return match[1];
}

describe("result experience mobile layout", () => {
  it("does not turn a slow worker into a one-minute client-side failure", () => {
    expect(resultTsx).toContain("analysisSlowMs");
    expect(resultTsx).toContain("setIsTakingLong(true)");
    expect(resultTsx).not.toContain("분석 응답이 너무 오래 걸려서 중단했습니다.");
    expect(resultTsx).not.toContain("${data.errorCode");
    expect(resultTsx).toContain("분석이 길어지고 있어요.");
    expect(resultTsx).toContain("분석 서버가 응답을 마치지 못했어요.");
  });

  it("promotes the question to a centered top card", () => {
    const topMeta = selectorBlock(".topMeta");
    const question = selectorBlock(".question");

    expect(topMeta).toContain("left: 50%");
    expect(topMeta).toContain("right: auto");
    expect(topMeta).toContain("transform: translateX(-50%)");
    expect(topMeta).toContain("align-items: center");
    expect(question).toContain("text-align: center");
    expect(question).toContain("font-size: clamp(16px");
  });

  it("keeps the analyzing and failure cards out of awkward face/text overlaps", () => {
    const analyzingLayer = selectorBlock(".analyzingLayer");
    const failedCard = selectorBlock(".failedCard");
    const failedCopyLine = selectorBlock(".failedCopyLine");

    expect(analyzingLayer).toContain("align-items: end");
    expect(analyzingLayer).toContain("padding-bottom: max(86px, 14dvh)");
    expect(failedCard).toContain("max-width: min(88vw, 390px)");
    expect(failedCopyLine).toContain("display: block");
    expect(failedCopyLine).toContain("white-space: nowrap");
  });

  it("preserves the recorded camera aspect ratio during result playback", () => {
    const video = selectorBlock(".video,\n.videoPlaceholder");

    expect(video).toContain("object-fit: contain");
    expect(video).toContain("object-position: center center");
  });

  it("loops only the target-answer segment during analysis playback", () => {
    expect(resultTsx).toContain("recordingLocalStore.getTiming(sessionId)");
    expect(resultTsx).toContain("coercePlaybackClip(data.recording)");
    expect(resultTsx).toContain("loop={!clip}");
    expect(resultTsx).toContain("onTimeUpdate={loopTargetClip}");
    expect(resultTsx).toContain("video.currentTime = clip.startSec");
  });
});
