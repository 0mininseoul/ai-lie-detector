import { describe, expect, it } from "vitest";
import { createWorkerUploadToken, maxWorkerUploadByteSize, verifyWorkerUploadToken } from "@/lib/uploads/worker-token";

const payload = {
  sessionId: "00000000-0000-4000-8000-000000000001",
  segment: "target" as const,
  r2Key: "recordings/00000000-0000-4000-8000-000000000001/target/capture.webm",
  mimeType: "video/webm",
  byteSize: 1_000_000,
  expiresAtMs: 4_102_444_800_000
};

describe("worker upload token", () => {
  it("round-trips a signed upload payload", async () => {
    const token = await createWorkerUploadToken(payload, "secret");
    const result = await verifyWorkerUploadToken(token, "secret", 4_102_444_799_000);

    expect(result.valid).toBe(true);
    if (!result.valid) throw new Error(result.error);
    expect(result.payload).toEqual(payload);
  });

  it("rejects tampered tokens", async () => {
    const token = await createWorkerUploadToken(payload, "secret");
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;
    const result = await verifyWorkerUploadToken(tampered, "secret", 4_102_444_799_000);

    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("Expected invalid token");
    expect(result.error).toBe("Invalid upload token signature");
  });

  it("rejects expired tokens", async () => {
    const token = await createWorkerUploadToken(payload, "secret");
    const result = await verifyWorkerUploadToken(token, "secret", 4_102_444_801_000);

    expect(result.valid).toBe(false);
    if (result.valid) throw new Error("Expected expired token");
    expect(result.error).toBe("Upload token expired");
  });

  it("refuses to sign uploads over the Worker storage guardrail", async () => {
    expect(maxWorkerUploadByteSize).toBe(32 * 1024 * 1024);
    await expect(
      createWorkerUploadToken({ ...payload, byteSize: maxWorkerUploadByteSize + 1 }, "secret")
    ).rejects.toThrow();
  });
});
