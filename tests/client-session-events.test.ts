import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routePath = join(process.cwd(), "src/app/api/client-events/route.ts");
const route = existsSync(routePath) ? readFileSync(routePath, "utf8") : "";
const recorder = readFileSync(join(process.cwd(), "src/app/s/[id]/SessionRecorder.tsx"), "utf8");

describe("client session recorder observability", () => {
  it("publishes bounded client recorder events through a server-side Axiom route", () => {
    expect(route).toContain("logAxiomEvent");
    expect(route).toContain('event: `client_${input.event}`');
    expect(route).toContain("sessionId");
    expect(route).toContain("details");
    expect(route).toContain("z.object");
    expect(route).toContain("NextResponse.json");
  });

  it("sends recorder boundary events without blocking the session flow", () => {
    expect(recorder).toContain("function logClientEvent");
    expect(recorder).toContain("fetch(\"/api/client-events\"");
    expect(recorder).toContain('method: "POST"');
    expect(recorder).toContain("void logClientEvent");
  });
});
