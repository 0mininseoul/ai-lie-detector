"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickSupportedMimeType } from "@/lib/recording/mime";

export type CameraStatus = "idle" | "starting" | "ready" | "error";
export type RecordingStatus = "idle" | "recording" | "stopping" | "recorded" | "error";

export type RecordingStopResult = {
  blob: Blob;
  mimeType: string;
  durationMs: number;
  startedAtMs: number;
  stoppedAtMs: number;
  chunkCount: number;
  sizeBytes: number;
};

function getNowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function getSupportedMimeType() {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") {
    return "";
  }

  return pickSupportedMimeType((mimeType) => MediaRecorder.isTypeSupported(mimeType));
}

function stopStreamTracks(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => {
    track.stop();
  });
}

type CameraVideoConstraints = MediaTrackConstraints & {
  resizeMode?: { ideal: string };
};

async function applyWidestCameraView(stream: MediaStream) {
  const [track] = stream.getVideoTracks();
  if (!track) return;

  const zoomTrack = track as MediaStreamTrack & {
    applyConstraints: (constraints: MediaTrackConstraints & { advanced?: Array<Record<string, unknown>> }) => Promise<void>;
  };
  const capabilities = track.getCapabilities?.() as ({ zoom?: { min?: number } } | undefined);
  const minZoom = capabilities?.zoom?.min;
  if (typeof minZoom !== "number" || !Number.isFinite(minZoom)) return;

  // Zoom all the way out to the widest framing the lens supports. Try the
  // `advanced` form first (most browsers), then a top-level constraint as a
  // fallback for builds that only honor that shape.
  try {
    await zoomTrack.applyConstraints({ advanced: [{ zoom: minZoom }] });
  } catch {
    try {
      await zoomTrack.applyConstraints({ zoom: minZoom } as MediaTrackConstraints);
    } catch {
      // Some iOS browser builds expose zoom but reject applying it. The stream
      // is still usable, so keep recording with the browser default.
    }
  }
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Recording failed";
}

export function useCameraRecorder() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const dataWaitersRef = useRef<Array<() => void>>([]);
  const sliceChunkStartIndexRef = useRef(0);
  const sliceStartedAtMsRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number | null>(null);
  const stopRecordingPromiseRef = useRef<Promise<RecordingStopResult | null> | null>(null);
  const startCameraPromiseRef = useRef<Promise<MediaStream | null> | null>(null);
  const cameraStartTokenRef = useRef(0);
  const isMountedRef = useRef(false);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraStatus, setCameraStatus] = useState<CameraStatus>("idle");
  const [recordingStatus, setRecordingStatus] = useState<RecordingStatus>("idle");
  const [selectedMimeType, setSelectedMimeType] = useState("");
  const [latestError, setLatestError] = useState<string | null>(null);
  const [recording, setRecording] = useState<RecordingStopResult | null>(null);

  const setMountedState = useCallback(<T,>(setter: (value: T) => void, value: T) => {
    if (isMountedRef.current) {
      setter(value);
    }
  }, []);

  const attachStream = useCallback((nextStream: MediaStream | null) => {
    if (videoRef.current) {
      videoRef.current.srcObject = nextStream;
    }
  }, []);

  const resetRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    recorderRef.current = null;
    chunksRef.current = [];
    dataWaitersRef.current = [];
    sliceChunkStartIndexRef.current = 0;
    sliceStartedAtMsRef.current = null;
    recordingStartedAtRef.current = null;
    stopRecordingPromiseRef.current = null;
    setRecording(null);
    setRecordingStatus("idle");
    setLatestError(null);
  }, []);

  const startCamera = useCallback(async () => {
    if (startCameraPromiseRef.current) {
      return startCameraPromiseRef.current;
    }

    try {
      if (streamRef.current) {
        attachStream(streamRef.current);
        setCameraStatus("ready");
        return streamRef.current;
      }

      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("Camera and microphone are not available in this browser");
      }

      setCameraStatus("starting");
      setLatestError(null);

      const requestToken = cameraStartTokenRef.current + 1;
      cameraStartTokenRef.current = requestToken;

      // iOS Safari/Chrome crop (zoom into) the front camera when we pin a high
      // portrait resolution or aspect ratio — the browser picks the capture
      // format closest to the request, and a tall 3:4 request makes it choose a
      // narrow, center-cropped readout. Requesting only the facing mode (plus a
      // gentle resolution floor for Android) lets it fall back to the widest
      // default preview, which is far closer to the native Camera app's selfie
      // field of view. `resizeMode: none` blocks an extra software crop, and CSS
      // `object-fit` handles the portrait display crop instead.
      const videoConstraints: CameraVideoConstraints = {
        facingMode: "user",
        width: { ideal: 1280 },
        frameRate: { ideal: 24, max: 30 },
        resizeMode: { ideal: "none" }
      };

      let pendingStart: Promise<MediaStream | null>;
      pendingStart = navigator.mediaDevices
        .getUserMedia({
          video: videoConstraints,
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        .then(async (nextStream) => {
          const mimeType = getSupportedMimeType();
          await applyWidestCameraView(nextStream);

          if (!isMountedRef.current || cameraStartTokenRef.current !== requestToken) {
            stopStreamTracks(nextStream);
            return null;
          }

          streamRef.current = nextStream;
          attachStream(nextStream);
          setMountedState(setStream, nextStream);
          setMountedState(setSelectedMimeType, mimeType);
          setMountedState(setCameraStatus, "ready");
          return nextStream;
        })
        .catch((error: unknown) => {
          if (cameraStartTokenRef.current === requestToken) {
            const message = toErrorMessage(error);
            setMountedState(setLatestError, message);
            setMountedState(setCameraStatus, "error");
          }
          return null;
        })
        .finally(() => {
          if (startCameraPromiseRef.current === pendingStart) {
            startCameraPromiseRef.current = null;
          }
        });

      startCameraPromiseRef.current = pendingStart;
      return pendingStart;
    } catch (error) {
      const message = toErrorMessage(error);
      setMountedState(setLatestError, message);
      setMountedState(setCameraStatus, "error");
      return null;
    }
  }, [attachStream, setMountedState]);

  const startRecording = useCallback(async () => {
    try {
      const activeStream = streamRef.current ?? (await startCamera());
      if (!activeStream) {
        return false;
      }

      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder is not available in this browser");
      }

      if (recorderRef.current?.state === "recording") {
        return true;
      }

      const mimeType = getSupportedMimeType();
      const options: MediaRecorderOptions = {
        ...(mimeType ? { mimeType } : {}),
        videoBitsPerSecond: 4_000_000,
        audioBitsPerSecond: 96_000
      };
      const recorder = new MediaRecorder(activeStream, options);

      const startedAtMs = getNowMs();
      chunksRef.current = [];
      dataWaitersRef.current = [];
      sliceChunkStartIndexRef.current = 0;
      sliceStartedAtMsRef.current = startedAtMs;
      recordingStartedAtRef.current = startedAtMs;
      stopRecordingPromiseRef.current = null;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
        const waiters = dataWaitersRef.current.splice(0);
        waiters.forEach((waiter) => waiter());
      };
      recorder.onerror = () => {
        setMountedState(setLatestError, "MediaRecorder reported a recording error");
        setMountedState(setRecordingStatus, "error");
      };

      recorderRef.current = recorder;
      setRecording(null);
      setSelectedMimeType(mimeType);
      recorder.start(1000);
      setRecordingStatus("recording");
      setLatestError(null);
      return true;
    } catch (error) {
      const message = toErrorMessage(error);
      setMountedState(setLatestError, message);
      setMountedState(setRecordingStatus, "error");
      return false;
    }
  }, [setMountedState, startCamera]);

  const flushRecorderData = useCallback((recorder: MediaRecorder) => {
    if (recorder.state === "inactive") return Promise.resolve();

    return new Promise<void>((resolve) => {
      let settled = false;
      let timeout: number | undefined;

      const done = () => {
        if (settled) return;
        settled = true;
        if (timeout !== undefined) window.clearTimeout(timeout);
        dataWaitersRef.current = dataWaitersRef.current.filter((waiter) => waiter !== done);
        resolve();
      };

      dataWaitersRef.current.push(done);
      timeout = window.setTimeout(done, 1200);

      try {
        recorder.requestData();
      } catch {
        done();
      }
    });
  }, []);

  const captureRecordingSlice = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      setLatestError("No active recording slice to capture");
      setRecordingStatus("error");
      return null;
    }

    const stoppedAtMs = getNowMs();
    await flushRecorderData(recorder);

    const startedAtMs = sliceStartedAtMsRef.current ?? recordingStartedAtRef.current ?? stoppedAtMs;
    const mimeType = recorder.mimeType || selectedMimeType;
    const sliceChunks = chunksRef.current.slice(sliceChunkStartIndexRef.current);
    const blob = new Blob(sliceChunks, mimeType ? { type: mimeType } : undefined);
    const result = {
      blob,
      mimeType,
      durationMs: Math.max(0, stoppedAtMs - startedAtMs),
      startedAtMs,
      stoppedAtMs,
      chunkCount: sliceChunks.length,
      sizeBytes: blob.size
    };

    setMountedState(setRecording, result);
    setMountedState(setSelectedMimeType, mimeType);
    setMountedState(setLatestError, null);
    return result;
  }, [flushRecorderData, selectedMimeType, setMountedState]);

  const startNewRecordingSlice = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state !== "recording") {
      setLatestError("No active recording to split");
      setRecordingStatus("error");
      return false;
    }

    await flushRecorderData(recorder);
    sliceChunkStartIndexRef.current = chunksRef.current.length;
    sliceStartedAtMsRef.current = getNowMs();
    setMountedState(setRecording, null);
    setMountedState(setLatestError, null);
    return true;
  }, [flushRecorderData, setMountedState]);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) {
      setLatestError("No active recording to stop");
      setRecordingStatus("error");
      return null;
    }

    if (stopRecordingPromiseRef.current) {
      return stopRecordingPromiseRef.current;
    }

    const stoppedAtMs = getNowMs();
    const sliceChunkStartIndex = sliceChunkStartIndexRef.current;
    const sliceStartedAtMs = sliceStartedAtMsRef.current ?? recordingStartedAtRef.current ?? stoppedAtMs;
    setRecordingStatus("stopping");

    stopRecordingPromiseRef.current = new Promise<RecordingStopResult | null>((resolve) => {
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || selectedMimeType;
        const sliceChunks = chunksRef.current.slice(sliceChunkStartIndex);
        const blob = new Blob(sliceChunks, mimeType ? { type: mimeType } : undefined);
        const result = {
          blob,
          mimeType,
          durationMs: Math.max(0, stoppedAtMs - sliceStartedAtMs),
          startedAtMs: sliceStartedAtMs,
          stoppedAtMs,
          chunkCount: sliceChunks.length,
          sizeBytes: blob.size
        };

        recorderRef.current = null;
        recordingStartedAtRef.current = null;
        sliceStartedAtMsRef.current = null;
        sliceChunkStartIndexRef.current = 0;
        dataWaitersRef.current = [];
        setMountedState(setRecording, result);
        setMountedState(setSelectedMimeType, mimeType);
        setMountedState(setRecordingStatus, "recorded");
        setMountedState(setLatestError, null);
        resolve(result);
      };

      if (recorder.state === "inactive") {
        recorder.onstop?.(new Event("stop"));
      } else {
        try {
          recorder.requestData();
        } catch {
          // stop() will still trigger a final dataavailable event in browsers
          // that support MediaRecorder; requestData() is only a best-effort
          // flush to reduce empty final slices on iOS.
        }
        recorder.stop();
      }
    });

    return stopRecordingPromiseRef.current;
  }, [selectedMimeType, setMountedState]);

  const stopCamera = useCallback(async () => {
    cameraStartTokenRef.current += 1;
    startCameraPromiseRef.current = null;

    const recorder = recorderRef.current;
    if (recorder && recorder.state === "recording") {
      await stopRecording();
    } else if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }

    stopStreamTracks(streamRef.current);
    streamRef.current = null;
    attachStream(null);
    setStream(null);
    setCameraStatus("idle");
  }, [attachStream, stopRecording]);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      recorderRef.current = null;
      dataWaitersRef.current = [];
      sliceChunkStartIndexRef.current = 0;
      sliceStartedAtMsRef.current = null;
      cameraStartTokenRef.current += 1;
      startCameraPromiseRef.current = null;
      stopStreamTracks(streamRef.current);
      streamRef.current = null;
      attachStream(null);
    };
  }, [attachStream]);

  return {
    videoRef,
    stream,
    cameraStatus,
    recordingStatus,
    isCameraReady: cameraStatus === "ready",
    isRecording: recordingStatus === "recording",
    selectedMimeType,
    latestError,
    recording,
    startCamera,
    startRecording,
    captureRecordingSlice,
    startNewRecordingSlice,
    stopRecording,
    resetRecording,
    stopCamera
  };
}
