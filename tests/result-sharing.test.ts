import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const actionsTsx = readFileSync(join(process.cwd(), "src/app/result/[id]/ResultActions.tsx"), "utf8");
const experienceTsx = readFileSync(join(process.cwd(), "src/app/result/[id]/ResultExperience.tsx"), "utf8");
const kakaoShareTs = readFileSync(join(process.cwd(), "src/lib/kakao/share.ts"), "utf8");
const pageTsx = readFileSync(join(process.cwd(), "src/app/result/[id]/page.tsx"), "utf8");
const completeUploadRoute = readFileSync(join(process.cwd(), "src/app/api/sessions/[id]/complete-upload/route.ts"), "utf8");
const r2Lifecycle = readFileSync(join(process.cwd(), "worker/r2-lifecycle.json"), "utf8");
const worker = readFileSync(join(process.cwd(), "worker/src/index.ts"), "utf8");

describe("result sharing", () => {
  it("shares a Kakao feed card before falling back to Web Share and clipboard", () => {
    expect(actionsTsx).toContain("prepareKakaoShare");
    expect(actionsTsx).toContain("!shareImageReady");
    expect(actionsTsx).toContain("await ensureShareImage?.()");
    expect(actionsTsx).toContain("shareResultWithKakao");
    expect(actionsTsx).toContain("shareImageUrl(sessionId)");
    expect(actionsTsx.indexOf("shareResultWithKakao")).toBeLessThan(actionsTsx.indexOf("navigator.share({ url: shareUrl })"));
    expect(actionsTsx).toContain("navigator.share({ url: shareUrl })");
    expect(actionsTsx).toContain("navigator.clipboard.writeText(shareUrl)");
    expect(actionsTsx).not.toContain("text: shareText");
  });

  it("configures Kakao sharing with a neutral feed and result button", () => {
    expect(kakaoShareTs).toContain("prepareKakaoShare");
    expect(kakaoShareTs).toContain("sendDefault");
    expect(kakaoShareTs).toContain('objectType: "feed"');
    expect(kakaoShareTs).toContain('title: question');
    expect(kakaoShareTs).toContain('description: kakaoShareDescription');
    expect(kakaoShareTs).toContain('title: "결과 보러가기"');
    expect(kakaoShareTs).not.toContain("scrapImage");
    expect(kakaoShareTs).not.toContain("headline");
    expect(kakaoShareTs).not.toContain("roast");
  });

  it("publishes a dynamic Open Graph image route backed by the worker share image", () => {
    expect(pageTsx).toContain("generateMetadata");
    expect(pageTsx).toContain("shareImageUrl(id)");
    expect(pageTsx).toContain('const title = sessionResponse.data?.target_question || "AI 거짓말탐지기"');
    expect(pageTsx).toContain('const description = "지금 AI 거짓말탐지기에서 결과를 확인하세요."');
    expect(pageTsx).toContain("width: 1080");
    expect(pageTsx).toContain("height: 1440");
    expect(pageTsx).not.toContain("roast_comment");
    expect(worker).toContain("/share-image/");
    expect(worker).toContain("share-images/${sessionId}/preview-20260526-question-only.jpg");
  });

  it("keeps the generated Kakao preview image to one bottom question line", () => {
    expect(experienceTsx).toContain("const shareImageWidth = 1080");
    expect(experienceTsx).toContain("const shareImageHeight = 1440");
    expect(experienceTsx).toContain("setShareImageReady(uploaded)");
    expect(experienceTsx).toContain("drawFallbackShareImageBackground(ctx)");
    expect(experienceTsx).toContain("video?.videoWidth && video.videoHeight");
    expect(experienceTsx).toContain("videoSrc={recordingUnavailable ? null : videoSrc}");
    expect(experienceTsx).toContain("fitText(ctx, question, 72, 1190, shareImageWidth - 144)");
    expect(experienceTsx).not.toContain("shareImageCallToAction");
    expect(experienceTsx).not.toContain("roundRect(ctx");
    expect(experienceTsx).not.toContain("ctx.fillText(headline");
    expect(experienceTsx).not.toContain("wrapCanvasText(ctx, roast");
    expect(worker).toContain('width="1080" height="1440"');
  });

  it("keeps recordings for the same public result retention window", () => {
    expect(completeUploadRoute).toContain("7 * 24 * 60 * 60 * 1000");
    expect(worker).toContain("7 * 24 * 60 * 60 * 1000");
    expect(r2Lifecycle).toContain('"id": "delete-recordings-after-7-days"');
    expect(r2Lifecycle).toContain('"maxAge": 604800');
  });
});
