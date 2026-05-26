import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const card = readFileSync(join(process.cwd(), "src/components/ui/pricing-card.tsx"), "utf8");
const pricePage = readFileSync(join(process.cwd(), "src/app/price/page.tsx"), "utf8");

describe("pricing card uses the day-pass catalog", () => {
  it("renders from the shared PASS_PRODUCTS catalog", () => {
    expect(card).toContain('from "@/lib/payments/products"');
    expect(card).toContain("PASS_PRODUCTS");
  });

  it("drops the legacy single/pack credit model", () => {
    expect(card).not.toContain("SINGLE_PRICE");
    expect(card).not.toContain("PACK_PRICE");
    expect(card).not.toContain("PACK_SIZE");
    expect(card).not.toContain("Counter");
    expect(card).not.toContain("1회권");
    expect(card).not.toContain("묶음권");
  });

  it("keeps a free trial entry as the viral hook", () => {
    expect(card).toContain("무료 체험");
  });
});

describe("price page copy reflects passes", () => {
  it("no longer promises per-question single pricing", () => {
    expect(pricePage).not.toContain("1회권");
    expect(pricePage).not.toContain("묶음권");
  });
  it("mentions unlimited passes", () => {
    expect(pricePage).toContain("무제한");
  });
});
