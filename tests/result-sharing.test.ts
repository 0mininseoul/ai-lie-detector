import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const actionsTsx = readFileSync(join(process.cwd(), "src/app/result/[id]/ResultActions.tsx"), "utf8");
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
    expect(worker).toContain("/share-image/");
    expect(worker).toContain("share-images/${sessionId}/preview.jpg");
  });
});
