import { describe, expect, it } from "vitest";
import { buildAxiomIngestUrl, sanitizeAxiomEvent } from "@/lib/observability/axiom";

describe("axiom observability helpers", () => {
  it("builds the default dataset ingest endpoint", () => {
    expect(buildAxiomIngestUrl("ai-lie-detector", { AXIOM_URL: "https://api.axiom.co/" })).toBe(
      "https://api.axiom.co/v1/datasets/ai-lie-detector/ingest"
    );
  });

  it("supports explicit ingest URLs for edge deployments", () => {
    expect(
      buildAxiomIngestUrl("prod logs", {
        AXIOM_INGEST_URL: "https://edge.example/v1/ingest/{dataset}"
      })
    ).toBe("https://edge.example/v1/ingest/prod%20logs");
  });

  it("keeps log payloads bounded", () => {
    const sanitized = sanitizeAxiomEvent({
      message: "a".repeat(1200),
      nested: { values: Array.from({ length: 30 }, (_, index) => index) }
    }) as { message: string; nested: { values: number[] } };

    expect(sanitized.message).toHaveLength(900);
    expect(sanitized.message.endsWith("...")).toBe(true);
    expect(sanitized.nested.values).toHaveLength(16);
  });
});
