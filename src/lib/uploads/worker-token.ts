import { z } from "zod";

export const maxWorkerUploadByteSize = 32 * 1024 * 1024;

const uploadTokenPayloadSchema = z.object({
  sessionId: z.uuid(),
  segment: z.enum(["warmup", "target"]).optional(),
  r2Key: z.string().min(1).max(1024),
  mimeType: z.string().min(1).max(255),
  byteSize: z.number().int().positive().max(maxWorkerUploadByteSize),
  expiresAtMs: z.number().int().positive()
}).strict();

export type WorkerUploadTokenPayload = z.infer<typeof uploadTokenPayloadSchema>;

export type WorkerUploadTokenVerification =
  | {
      valid: true;
      payload: WorkerUploadTokenPayload;
    }
  | {
      valid: false;
      error: string;
    };

export async function createWorkerUploadToken(payload: WorkerUploadTokenPayload, secret: string) {
  const parsed = uploadTokenPayloadSchema.parse(payload);
  const encodedPayload = base64UrlEncode(JSON.stringify(parsed));
  const signature = await sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

export async function verifyWorkerUploadToken(
  token: string | null,
  secret: string,
  nowMs = Date.now()
): Promise<WorkerUploadTokenVerification> {
  if (!token) {
    return { valid: false, error: "Upload token is required" };
  }

  const [encodedPayload, signature, extra] = token.split(".");
  if (!encodedPayload || !signature || extra !== undefined) {
    return { valid: false, error: "Invalid upload token format" };
  }

  const expectedSignature = await sign(encodedPayload, secret);
  if (!constantTimeEqual(signature, expectedSignature)) {
    return { valid: false, error: "Invalid upload token signature" };
  }

  let payload: WorkerUploadTokenPayload;
  try {
    payload = uploadTokenPayloadSchema.parse(JSON.parse(base64UrlDecode(encodedPayload)));
  } catch {
    return { valid: false, error: "Invalid upload token payload" };
  }

  if (payload.expiresAtMs < nowMs) {
    return { valid: false, error: "Upload token expired" };
  }

  return { valid: true, payload };
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function base64UrlEncode(value: string) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new TextDecoder().decode(bytes);
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;

  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  }
  return difference === 0;
}
