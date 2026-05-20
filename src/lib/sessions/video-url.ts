function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function recordingDownloadUrl(sessionId: string): string {
  const base = trimTrailingSlash(
    (process.env.NEXT_PUBLIC_ANALYSIS_WORKER_URL ?? process.env.NEXT_PUBLIC_WORKER_URL ?? "").trim()
  );
  if (!base) return "";
  return `${base}/recording/${sessionId}`;
}
