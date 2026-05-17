import "server-only";

export { buildRecordingObjectKey, presignR2PutUrl } from "./presign-core";

export type R2UploadConfig = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
};

export function getR2UploadConfig(): R2UploadConfig {
  const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME;

  if (!accountId) throw new Error("CLOUDFLARE_R2_ACCOUNT_ID is required");
  if (!accessKeyId) throw new Error("CLOUDFLARE_R2_ACCESS_KEY_ID is required");
  if (!secretAccessKey) throw new Error("CLOUDFLARE_R2_SECRET_ACCESS_KEY is required");
  if (!bucketName) throw new Error("CLOUDFLARE_R2_BUCKET_NAME is required");

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName
  };
}
