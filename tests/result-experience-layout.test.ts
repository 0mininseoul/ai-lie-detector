import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const resultTsx = readFileSync(join(process.cwd(), "src/app/result/[id]/ResultExperience.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/app/result/[id]/ResultExperience.module.css"), "utf8");
const completeUploadRoute = readFileSync(join(process.cwd(), "src/app/api/sessions/[id]/complete-upload/route.ts"), "utf8");

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

  it("promotes the question to a centered top card without overflowing long questions", () => {
    const topMeta = selectorBlock(".topMeta");
    const question = selectorBlock(".question");
    const brand = selectorBlock(".brand");

    expect(topMeta).toContain("left: 50%");
    expect(topMeta).toContain("right: auto");
    expect(topMeta).toContain("transform: translateX(-50%)");
    expect(topMeta).toContain("align-items: center");
    expect(topMeta).toContain("max-width: min(92vw, 520px)");
    expect(brand).toContain("font-size: 13px");
    expect(question).toContain("text-align: center");
    expect(question).toContain("font-size: clamp(17px");
    expect(question).toContain("display: -webkit-box");
    expect(question).toContain("-webkit-line-clamp: 2");
    expect(question).toContain("-webkit-box-orient: vertical");
    expect(question).toContain("overflow: hidden");
    expect(question).toContain("white-space: normal");
    expect(question).toContain("overflow-wrap: anywhere");
    expect(question).not.toContain("white-space: nowrap");
  });

  it("keeps verdict copy readable and action chips in one row", () => {
    const roast = selectorBlock(".roast");
    const roastLine = selectorBlock(".roastLine");
    const actionBar = selectorBlock(".actionBar");
    const action = selectorBlock(".primaryAction,\n.secondaryAction");

    expect(resultTsx).toContain("splitRoastLines(roast)");
    expect(roast).toContain("max-width: min(21em, 100%)");
    expect(roastLine).toContain("display: block");
    expect(actionBar).toContain("flex-direction: row");
    expect(actionBar).toContain("flex-wrap: nowrap");
    expect(action).toContain("white-space: nowrap");
  });

  it("keeps the analyzing and failure cards out of awkward face/text overlaps", () => {
    const analyzingLayer = selectorBlock(".analyzingLayer");
    const failedCard = selectorBlock(".failedCard");
    const failedCopyLine = selectorBlock(".failedCopyLine");

    expect(analyzingLayer).toContain("align-items: end");
    expect(analyzingLayer).toContain("padding-bottom: max(72px, 12dvh)");
    expect(failedCard).toContain("max-width: min(88vw, 390px)");
    expect(failedCopyLine).toContain("display: block");
    expect(failedCopyLine).toContain("white-space: nowrap");
  });

  it("fills the portrait result frame and mirrors selfie playback", () => {
    const video = selectorBlock(".video,\n.videoPlaceholder");
    const videoOnly = selectorBlock(".video");

    expect(video).toContain("object-fit: cover");
    expect(video).toContain("object-position: center center");
    expect(videoOnly).toContain("transform: scaleX(-1)");
    expect(css).toContain(".videoPlaceholder p");
  });

  it("loops only the target-answer segment during analysis playback", () => {
    expect(resultTsx).toContain("recordingLocalStore.getTiming(sessionId)");
    expect(resultTsx).toContain("coercePlaybackClip(data.recording)");
    expect(resultTsx).toContain("loop={!clip}");
    expect(resultTsx).toContain("onTimeUpdate={loopTargetClip}");
    expect(resultTsx).toContain("video.currentTime = clip.startSec");
  });

  it("starts analysis from the result page after upload completion", () => {
    expect(completeUploadRoute).not.toContain("triggerAnalysis");
    expect(completeUploadRoute).toContain("analysisQueued: false");
    expect(resultTsx).toContain("analysisStartAttemptedRef");
    expect(resultTsx).toContain('data.status === "uploaded"');
    expect(resultTsx).toContain("startAnalysisOnce");
    expect(resultTsx).toContain("fetch(`/api/sessions/${sessionId}/analyze`");
    expect(resultTsx).toContain('method: "POST"');
  });

  it("refreshes session status immediately when the analyze request returns", () => {
    expect(resultTsx).toContain("refreshStatus");
    expect(resultTsx).toContain("await refreshStatus()");
  });
});
