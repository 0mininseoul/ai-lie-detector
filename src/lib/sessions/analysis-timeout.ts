export const analysisSlowMs = 45_000;
export const analysisStaleMs = 3 * 60_000;
export const analysisTimeoutErrorCode = "analysis_timeout";
export const analysisTimeoutErrorDetail = "분석 응답이 제한 시간 안에 완료되지 않았습니다.";

export function isAnalysisStale(status: string, updatedAt: string | null | undefined, nowMs = Date.now()) {
  if (status !== "analyzing" || !updatedAt) return false;

  const updatedAtMs = Date.parse(updatedAt);
  if (!Number.isFinite(updatedAtMs)) return false;

  return nowMs - updatedAtMs >= analysisStaleMs;
}
