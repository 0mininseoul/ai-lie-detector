const blobs = new Map<string, Blob>();
const urls = new Map<string, string>();

export const recordingLocalStore = {
  set(sessionId: string, blob: Blob): void {
    const previous = urls.get(sessionId);
    if (previous) URL.revokeObjectURL(previous);
    urls.delete(sessionId);
    blobs.set(sessionId, blob);
  },
  has(sessionId: string): boolean {
    return blobs.has(sessionId);
  },
  toUrl(sessionId: string): string | undefined {
    const cached = urls.get(sessionId);
    if (cached) return cached;
    const blob = blobs.get(sessionId);
    if (!blob) return undefined;
    const url = URL.createObjectURL(blob);
    urls.set(sessionId, url);
    return url;
  },
  clear(sessionId: string): void {
    const url = urls.get(sessionId);
    if (url) URL.revokeObjectURL(url);
    urls.delete(sessionId);
    blobs.delete(sessionId);
  }
};
