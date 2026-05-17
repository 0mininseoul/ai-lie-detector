import { describe, expect, it } from "vitest";
import { buildRecordingObjectKey, presignR2PutUrl } from "@/lib/r2/presign-core";

describe("presignR2PutUrl", () => {
  it("creates a Cloudflare R2 S3 presigned PUT URL for one object", () => {
    const url = new URL(
      presignR2PutUrl({
        accountId: "account123",
        accessKeyId: "access123",
        secretAccessKey: "secret123",
        bucketName: "ai-lie-detector-recordings",
        key: "recordings/session-123/capture.webm",
        contentType: "video/webm",
        expiresInSeconds: 300,
        now: new Date("2026-05-17T00:00:00.000Z")
      })
    );

    expect(url.origin).toBe("https://account123.r2.cloudflarestorage.com");
    expect(url.pathname).toBe("/ai-lie-detector-recordings/recordings/session-123/capture.webm");
    expect(url.searchParams.get("X-Amz-Algorithm")).toBe("AWS4-HMAC-SHA256");
    expect(url.searchParams.get("X-Amz-Content-Sha256")).toBe("UNSIGNED-PAYLOAD");
    expect(url.searchParams.get("X-Amz-Credential")).toBe("access123/20260517/auto/s3/aws4_request");
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-type;host");
    expect(url.searchParams.get("X-Amz-Signature")).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("buildRecordingObjectKey", () => {
  it("scopes recording keys under the owning session", () => {
    expect(buildRecordingObjectKey("session-123", "video/webm")).toMatch(
      /^recordings\/session-123\/[0-9a-f-]{36}\.webm$/
    );
    expect(buildRecordingObjectKey("session-123", "video/mp4")).toMatch(
      /^recordings\/session-123\/[0-9a-f-]{36}\.mp4$/
    );
  });
});
