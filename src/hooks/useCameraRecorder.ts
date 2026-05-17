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

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Recording failed";
}

export function useCameraRecorder() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
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

      let pendingStart: Promise<MediaStream | null>;
      pendingStart = navigator.mediaDevices
        .getUserMedia({
          video: {
            facingMode: "user",
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        })
        .then((nextStream) => {
          const mimeType = getSupportedMimeType();

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
      const options = mimeType ? { mimeType } : undefined;
      const recorder = new MediaRecorder(activeStream, options);

      chunksRef.current = [];
      recordingStartedAtRef.current = getNowMs();
      stopRecordingPromiseRef.current = null;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setMountedState(setLatestError, "MediaRecorder reported a recording error");
        setMountedState(setRecordingStatus, "error");
      };

      recorderRef.current = recorder;
      setRecording(null);
      setSelectedMimeType(mimeType);
      recorder.start();
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
    setRecordingStatus("stopping");

    stopRecordingPromiseRef.current = new Promise<RecordingStopResult | null>((resolve) => {
      recorder.onstop = () => {
        const startedAtMs = recordingStartedAtRef.current ?? stoppedAtMs;
        const mimeType = recorder.mimeType || selectedMimeType;
        const blob = new Blob(chunksRef.current, mimeType ? { type: mimeType } : undefined);
        const result = {
          blob,
          mimeType,
          durationMs: Math.max(0, stoppedAtMs - startedAtMs),
          startedAtMs,
          stoppedAtMs,
          chunkCount: chunksRef.current.length,
          sizeBytes: blob.size
        };

        recorderRef.current = null;
        recordingStartedAtRef.current = null;
        setMountedState(setRecording, result);
        setMountedState(setSelectedMimeType, mimeType);
        setMountedState(setRecordingStatus, "recorded");
        setMountedState(setLatestError, null);
        resolve(result);
      };

      if (recorder.state === "inactive") {
        recorder.onstop?.(new Event("stop"));
      } else {
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
    stopRecording,
    resetRecording,
    stopCamera
  };
}
