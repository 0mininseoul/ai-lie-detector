import { describe, expect, it } from "vitest";
import { PASS_PRODUCTS, getPassProduct, formatWon } from "@/lib/payments/products";

describe("pass products", () => {
  it("offers exactly the day/weekend/week passes in order", () => {
    expect(PASS_PRODUCTS.map((p) => p.id)).toEqual(["day", "weekend", "week"]);
  });

  it("prices and durations match the spec", () => {
    expect(getPassProduct("day")).toMatchObject({ price: 2900, durationSeconds: 86_400 });
    expect(getPassProduct("weekend")).toMatchObject({ price: 4900, durationSeconds: 259_200 });
    expect(getPassProduct("week")).toMatchObject({ price: 7900, durationSeconds: 604_800 });
  });

  it("does not expose any single-use or credit product", () => {
    for (const product of PASS_PRODUCTS) {
      expect(product).not.toHaveProperty("credits");
      expect(product.durationSeconds).toBeGreaterThan(0);
    }
  });

  it("formats KRW without decimals", () => {
    expect(formatWon(2900)).toBe("₩2,900");
  });

  it("returns undefined for an unknown product id", () => {
    expect(getPassProduct("month")).toBeUndefined();
  });
});
