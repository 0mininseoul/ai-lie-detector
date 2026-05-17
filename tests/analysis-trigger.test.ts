import { describe, expect, it, vi } from "vitest";
import { buildAnalyzeUrl, triggerAnalysis } from "@/lib/analysis/trigger";

const sessionId = "00000000-0000-4000-8000-000000000001";

describe("analysis trigger", () => {
  it("normalizes worker URLs to the analyze endpoint", () => {
    expect(buildAnalyzeUrl("https://worker.example.com")).toBe("https://worker.example.com/analyze");
    expect(buildAnalyzeUrl("https://worker.example.com/")).toBe("https://worker.example.com/analyze");
    expect(buildAnalyzeUrl("https://worker.example.com/analyze")).toBe("https://worker.example.com/analyze");
  });

  it("reports disabled when worker credentials are missing", async () => {
    await expect(triggerAnalysis(sessionId, { workerUrl: "", sharedSecret: "secret" })).resolves.toEqual({
      status: "disabled",
      queued: false,
      error: "ANALYSIS_WORKER_URL is required"
    });

    await expect(triggerAnalysis(sessionId, { workerUrl: "https://worker.example.com", sharedSecret: "" })).resolves.toEqual({
      status: "disabled",
      queued: false,
      error: "WORKER_SHARED_SECRET is required"
    });
  });

  it("queues analysis with bearer auth", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: "queued" }), { status: 200 }));

    await expect(
      triggerAnalysis(sessionId, {
        workerUrl: "https://worker.example.com",
        sharedSecret: "secret",
        fetcher
      })
    ).resolves.toEqual({
      status: "queued",
      queued: true
    });

    expect(fetcher).toHaveBeenCalledWith("https://worker.example.com/analyze", {
      method: "POST",
      headers: {
        authorization: "Bearer secret",
        "content-type": "application/json"
      },
      body: JSON.stringify({ sessionId })
    });
  });

  it("reports failed when worker queueing fails", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }));

    await expect(
      triggerAnalysis(sessionId, {
        workerUrl: "https://worker.example.com",
        sharedSecret: "wrong",
        fetcher
      })
    ).resolves.toEqual({
      status: "failed",
      queued: false,
      error: "Worker trigger failed with status 401: Unauthorized"
    });
  });
});
