import { NextResponse } from "next/server";
import { z } from "zod";
import { logAxiomEvent } from "@/lib/observability/axiom";

const clientEventSchema = z.object({
  sessionId: z.uuid().optional(),
  event: z.enum([
    "warmup_stop_requested",
    "warmup_stop_resolved",
    "warmup_blob_empty",
    "warmup_upload_started",
    "target_slice_started",
    "target_stop_requested",
    "target_stop_resolved",
    "recorder_boundary_error"
  ]),
  details: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional()
});

export async function POST(request: Request) {
  const json = await request.json().catch(() => null);
  const parsed = clientEventSchema.safeParse(json);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid client event" }, { status: 400 });
  }

  const input = parsed.data;
  await logAxiomEvent({
    event: `client_${input.event}`,
    sessionId: input.sessionId,
    level: input.event.includes("error") || input.event.includes("empty") ? "warn" : "info",
    details: input.details ?? {}
  });

  return NextResponse.json({ ok: true });
}
