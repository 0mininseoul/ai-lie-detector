import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const actionsTsx = readFileSync(join(process.cwd(), "src/app/result/[id]/ResultActions.tsx"), "utf8");
const experienceTsx = readFileSync(join(process.cwd(), "src/app/result/[id]/ResultExperience.tsx"), "utf8");
const pageTsx = readFileSync(join(process.cwd(), "src/app/result/[id]/page.tsx"), "utf8");
const worker = readFileSync(join(process.cwd(), "worker/src/index.ts"), "utf8");

describe("result sharing", () => {
  it("shares only the result URL through Web Share and clipboard fallback", () => {
    expect(actionsTsx).toContain("await ensureShareImage?.()");
    expect(actionsTsx).toContain("navigator.share({ url: shareUrl })");
    expect(actionsTsx).toContain("navigator.clipboard.writeText(shareUrl)");
    expect(actionsTsx).not.toContain("text: shareText");
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
    expect(worker).toContain("share-images/${sessionId}/preview-20260526-safe.jpg");
  });

  it("keeps the generated Kakao preview image result-neutral and portrait", () => {
    expect(experienceTsx).toContain("const shareImageWidth = 1080");
    expect(experienceTsx).toContain("const shareImageHeight = 1440");
    expect(experienceTsx).toContain("shareImageCallToAction");
    expect(experienceTsx).not.toContain("ctx.fillText(headline");
    expect(experienceTsx).not.toContain("wrapCanvasText(ctx, roast");
    expect(worker).toContain('width="1080" height="1440"');
  });
});
