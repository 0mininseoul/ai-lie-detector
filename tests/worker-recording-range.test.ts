import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const worker = readFileSync(join(process.cwd(), "worker/src/index.ts"), "utf8");

describe("worker recording video download", () => {
  it("supports HEAD requests for recording videos", () => {
    expect(worker).toContain('request.method === "GET" || request.method === "HEAD"');
    expect(worker).toContain('request.method === "HEAD"');
  });

  it("returns byte range headers for iOS video streaming", () => {
    expect(worker).toContain("parseByteRange");
    expect(worker).toContain('headers.set("accept-ranges", "bytes")');
    expect(worker).toContain('headers.set("content-range"');
    expect(worker).toContain("status: 206");
  });
});
