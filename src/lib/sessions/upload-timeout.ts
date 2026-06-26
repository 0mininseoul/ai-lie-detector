export const uploadStaleMs = 5 * 60_000;
export const uploadTimeoutErrorCode = "upload_timeout";
export const uploadTimeoutErrorDetail = "영상 업로드가 제한 시간 안에 완료되지 않았습니다.";

export function isUploadStale(status: string, updatedAt: string | null | undefined, nowMs = Date.now()) {
  if (status !== "created" && status !== "recording") return false;
  if (!updatedAt) return false;

  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtMs)) return false;

  return nowMs - updatedAtMs >= uploadStaleMs;
}
