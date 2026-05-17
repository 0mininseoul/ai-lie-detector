import { NextResponse } from "next/server";
import { z, ZodError } from "zod";
import { buildRecordingObjectKey, getR2UploadConfig, presignR2PutUrl } from "@/lib/r2/presign";
import { getSupabaseServer } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const sessionIdSchema = z.uuid();
const uploadUrlSchema = z.object({
  mimeType: z.string().trim().min(1).max(255).refine(
    (mimeType) => mimeType.startsWith("video/webm") || mimeType.startsWith("video/mp4"),
    "mimeType must be a supported video MIME type"
  ),
  byteSize: z.number().int().positive().max(150 * 1024 * 1024)
}).strict();

const uploadUrlExpiresInSeconds = 300;

function badRequest(error: unknown) {
  const message = error instanceof ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "Invalid request";

  return NextResponse.json({ error: message ?? "Invalid request" }, { status: 400 });
}

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const sessionId = sessionIdSchema.safeParse(id);

  if (!sessionId.success) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  let input: z.infer<typeof uploadUrlSchema>;

  try {
    input = uploadUrlSchema.parse(await request.json());
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

  if (!["created", "recording"].includes(session.status)) {
    return NextResponse.json({ error: "Session cannot accept a new recording" }, { status: 409 });
  }

  try {
    const r2 = getR2UploadConfig();
    const r2Key = buildRecordingObjectKey(sessionId.data, input.mimeType);
    const uploadUrl = presignR2PutUrl({
      ...r2,
      key: r2Key,
      contentType: input.mimeType,
      expiresInSeconds: uploadUrlExpiresInSeconds
    });

    return NextResponse.json({
      uploadUrl,
      r2Key,
      expiresInSeconds: uploadUrlExpiresInSeconds,
      requiredHeaders: {
        "content-type": input.mimeType
      }
    });
  } catch {
    return NextResponse.json({ error: "Failed to create upload URL" }, { status: 500 });
  }
}
