import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const recorder = readFileSync(join(process.cwd(), "src/app/s/[id]/SessionRecorder.tsx"), "utf8");
const hudCss = readFileSync(join(process.cwd(), "src/components/analysis/LiveAnalysisHud.module.css"), "utf8");
const hudMobileCss = hudCss.slice(hudCss.indexOf("@media (max-width: 720px)"));

function selectorBlock(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`Missing block for ${selector}`);
  return match[1];
}

describe("session recorder mobile flow", () => {
  it("uses 5-second automatic answer windows without manual friction", () => {
    expect(recorder).not.toContain("between");
    expect(recorder).not.toContain("대답 완료");
    expect(recorder).not.toContain("진짜 질문 보기");
    expect(recorder).not.toContain("지금 끝내기");
    expect(recorder).not.toContain("5초 안에 답해 주세요");
    expect(recorder).not.toContain("0초가 되는 순간");
    expect((recorder.match(/durationMs=\{5000\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("keeps setup guidance scannable with explicit check icons", () => {
    expect(recorder).toContain('data-check="face"');
    expect(recorder).toContain('data-check="light"');
    expect(recorder).toContain('data-check="voice"');
    expect(recorder).toContain("가벼운 질문 5초");
  });

  it("moves live metrics away from the face center on mobile", () => {
    const sideMetrics = selectorBlock(hudMobileCss, ".sideMetrics");

    expect(sideMetrics).toContain("top: auto");
    expect(sideMetrics).toContain("bottom: 52px");
    expect(sideMetrics).toContain("transform: none");
    expect(sideMetrics).toContain("grid-template-columns: repeat(2, minmax(0, auto))");
  });
});
