import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { getSupabaseServer } from "@/lib/supabase/server";
import { createWorkerUploadToken } from "@/lib/uploads/worker-token";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const sessionIdSchema = z.uuid();
const maxShareImageByteSize = 2 * 1024 * 1024;
const uploadUrlExpiresInSeconds = 300;
const shareImageSchema = z.object({
  mimeType: z.literal("image/jpeg"),
  byteSize: z.number().int().positive().max(maxShareImageByteSize)
}).strict();

function badRequest(error: unknown) {
  const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Invalid request";

  return NextResponse.json({ error: message ?? "Invalid request" }, { status: 400 });
}

function buildShareImageObjectKey(sessionId: string) {
  return `share-images/${sessionId}/preview.jpg`;
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const sessionId = sessionIdSchema.safeParse(id);

  if (!sessionId.success) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  let input: z.infer<typeof shareImageSchema>;

  try {
    input = shareImageSchema.parse(await request.json());
  } catch (error) {
    return badRequest(error);
  }

  const supabase = getSupabaseServer();
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, status")
    .eq("id", sessionId.data)
    .single();

  if (sessionError) {
    if (sessionError.code !== "PGRST116") {
      return NextResponse.json({ error: "Failed to load session" }, { status: 500 });
    }
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (session.status !== "complete") {
    return NextResponse.json({ error: "Session result is not ready" }, { status: 409 });
  }

  const workerUrl = process.env.ANALYSIS_WORKER_URL?.trim();
  const sharedSecret = process.env.WORKER_SHARED_SECRET?.trim();

  if (!workerUrl || !sharedSecret) {
    return NextResponse.json({ error: "Worker upload environment is not configured" }, { status: 503 });
  }

  const r2Key = buildShareImageObjectKey(sessionId.data);
  const expiresAtMs = Date.now() + uploadUrlExpiresInSeconds * 1000;
  const token = await createWorkerUploadToken(
    {
      sessionId: sessionId.data,
      r2Key,
      mimeType: input.mimeType,
      byteSize: input.byteSize,
      expiresAtMs
    },
    sharedSecret
  );
  const uploadUrl = new URL("/upload", workerUrl);
  uploadUrl.searchParams.set("token", token);

  return NextResponse.json({
    uploadUrl: uploadUrl.toString(),
    r2Key,
    expiresInSeconds: uploadUrlExpiresInSeconds,
    requiredHeaders: {
      "content-type": input.mimeType
    }
  });
}
