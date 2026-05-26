function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function workerBaseUrl() {
  return trimTrailingSlash(
    (process.env.NEXT_PUBLIC_ANALYSIS_WORKER_URL ?? process.env.NEXT_PUBLIC_WORKER_URL ?? "").trim()
  );
}

const sharePreviewVersion = "20260526-centered-question";

export function recordingDownloadUrl(sessionId: string): string {
  const base = workerBaseUrl();
  if (!base) return "";
  return `${base}/recording/${sessionId}`;
}

export function shareImageUrl(sessionId: string): string {
  const base = workerBaseUrl();
  if (!base) return "";
  return `${base}/share-image/${sessionId}?v=${sharePreviewVersion}`;
}
