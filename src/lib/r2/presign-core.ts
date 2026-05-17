import { createHash, createHmac, randomUUID } from "crypto";

export type R2PresignInput = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  key: string;
  contentType: string;
  expiresInSeconds: number;
  now?: Date;
};

const r2Region = "auto";
const r2Service = "s3";

export function buildRecordingObjectKey(sessionId: string, mimeType: string) {
  const extension = mimeType.startsWith("video/mp4") ? "mp4" : "webm";
  return `recordings/${sessionId}/${randomUUID()}.${extension}`;
}

export function presignR2PutUrl(input: R2PresignInput) {
  const now = input.now ?? new Date();
  const amzDate = toAmzDate(now);
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${r2Region}/${r2Service}/aws4_request`;
  const host = `${input.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodePath(input.bucketName)}/${encodePath(input.key)}`;
  const signedHeaders = "content-type;host";
  const credential = `${input.accessKeyId}/${credentialScope}`;

  const query = canonicalQueryString({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Content-Sha256": "UNSIGNED-PAYLOAD",
    "X-Amz-Credential": credential,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresInSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
    "x-id": "PutObject"
  });

  const canonicalHeaders = `content-type:${input.contentType}\nhost:${host}\n`;
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    query,
    canonicalHeaders,
    signedHeaders,
    "UNSIGNED-PAYLOAD"
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest)
  ].join("\n");

  const signingKey = getSigningKey(input.secretAccessKey, dateStamp);
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");

  return `https://${host}${canonicalUri}?${query}&X-Amz-Signature=${signature}`;
}

function getSigningKey(secretAccessKey: string, dateStamp: string) {
  const dateKey = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const regionKey = hmac(dateKey, r2Region);
  const serviceKey = hmac(regionKey, r2Service);
  return hmac(serviceKey, "aws4_request");
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function sha256Hex(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function toAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalQueryString(values: Record<string, string>) {
  return Object.entries(values)
    .map(([key, value]) => [rfc3986Encode(key), rfc3986Encode(value)] as const)
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => {
      if (leftKey === rightKey) return leftValue.localeCompare(rightValue);
      return leftKey.localeCompare(rightKey);
    })
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

function encodePath(path: string) {
  return path.split("/").map(rfc3986Encode).join("/");
}

function rfc3986Encode(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
