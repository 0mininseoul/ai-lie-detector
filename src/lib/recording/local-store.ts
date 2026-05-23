type LocalRecordingEntry = {
  blob: Blob;
  targetStartMs?: number;
  targetEndMs?: number;
};

const recordings = new Map<string, LocalRecordingEntry>();
const urls = new Map<string, string>();
const uploadPromises = new Map<string, Promise<void>>();

export const recordingLocalStore = {
  set(sessionId: string, blob: Blob, timing?: { targetStartMs?: number; targetEndMs?: number }): void {
    const previous = urls.get(sessionId);
    if (previous) URL.revokeObjectURL(previous);
    urls.delete(sessionId);
    recordings.set(sessionId, {
      blob,
      targetStartMs: timing?.targetStartMs,
      targetEndMs: timing?.targetEndMs
    });
  },
  has(sessionId: string): boolean {
    return recordings.has(sessionId);
  },
  setUploadPromise(sessionId: string, promise: Promise<void>): void {
    uploadPromises.set(sessionId, promise);
    void promise
      .catch(() => undefined)
      .finally(() => {
        if (uploadPromises.get(sessionId) === promise) {
          uploadPromises.delete(sessionId);
        }
      });
  },
  getUploadPromise(sessionId: string): Promise<void> | undefined {
    return uploadPromises.get(sessionId);
  },
  getTiming(sessionId: string): { targetStartMs?: number; targetEndMs?: number } | undefined {
    const recording = recordings.get(sessionId);
    if (!recording) return undefined;
    return {
      targetStartMs: recording.targetStartMs,
      targetEndMs: recording.targetEndMs
    };
  },
  toUrl(sessionId: string): string | undefined {
    const cached = urls.get(sessionId);
    if (cached) return cached;
    const recording = recordings.get(sessionId);
    if (!recording) return undefined;
    const url = URL.createObjectURL(recording.blob);
    urls.set(sessionId, url);
    return url;
  },
  clear(sessionId: string): void {
    const url = urls.get(sessionId);
    if (url) URL.revokeObjectURL(url);
    urls.delete(sessionId);
    recordings.delete(sessionId);
    uploadPromises.delete(sessionId);
  }
};
