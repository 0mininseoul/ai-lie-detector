"use client";

import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
import { createFeaturePayload, normalizeFeatureSamples, type FeatureSample } from "@/lib/recording/features";
import type { FeaturePayload } from "@/types/domain";

export type FeatureCollectorPhase = "idle" | "warmup" | "between" | "target" | "complete";
export type FeatureCollectorStatus = "idle" | "collecting" | "ready" | "error";

export type FeatureTimingMarks = {
  recordingStartMs: number | null;
  warmupStartMs: number | null;
  warmupEndMs: number | null;
  targetStartMs: number | null;
  targetEndMs: number | null;
  recordingEndMs: number | null;
};

export type FeaturePayloadBuildResult = {
  payload: FeaturePayload | null;
  error: string | null;
};

type FeatureSamplerInput = {
  stream: MediaStream | null;
  videoElement: HTMLVideoElement | null;
};

type FacePoint = {
  x: number;
  y: number;
  z?: number;
};

type FaceDetectionResult = {
  faceLandmarks?: FacePoint[][];
  faceBlendshapes?: Array<{
    categories?: Array<{
      categoryName?: string;
      score?: number;
    }>;
  }>;
};

type FaceLandmarkerInstance = {
  detectForVideo(video: HTMLVideoElement, timestampMs: number): FaceDetectionResult;
};

const emptyMarks: FeatureTimingMarks = {
  recordingStartMs: null,
  warmupStartMs: null,
  warmupEndMs: null,
  targetStartMs: null,
  targetEndMs: null,
  recordingEndMs: null
};

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }

  return Date.now();
}

function requireMark(marks: FeatureTimingMarks, key: keyof FeatureTimingMarks): number {
  const value = marks[key];
  if (value === null) {
    throw new Error(`${key} is required before collecting features`);
  }

  return value;
}

export function buildFeaturePayloadFromMarks(
  marks: FeatureTimingMarks,
  samples: FeatureSample[] = []
): FeaturePayloadBuildResult {
  try {
    const recordingStartMs = requireMark(marks, "recordingStartMs");
    const recordingEndMs = requireMark(marks, "recordingEndMs");
    const warmupStartMs = requireMark(marks, "warmupStartMs");
    const warmupEndMs = requireMark(marks, "warmupEndMs");
    const targetStartMs = requireMark(marks, "targetStartMs");
    const targetEndMs = requireMark(marks, "targetEndMs");

    return {
      payload: createFeaturePayload(
        {
          durationMs: recordingEndMs - recordingStartMs,
          warmupStartMs: warmupStartMs - recordingStartMs,
          warmupEndMs: warmupEndMs - recordingStartMs,
          targetStartMs: targetStartMs - recordingStartMs,
          targetEndMs: targetEndMs - recordingStartMs
        },
        normalizeFeatureSamples(recordingStartMs, samples)
      ),
      error: null
    };
  } catch (error) {
    return {
      payload: null,
      error: error instanceof Error ? error.message : "Unable to collect feature payload"
    };
  }
}

export function useFeatureCollector() {
  const marksRef = useRef<FeatureTimingMarks>(emptyMarks);
  const samplesRef = useRef<FeatureSample[]>([]);
  const samplerIntervalRef = useRef<number | null>(null);
  const sampleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousFrameRef = useRef<Uint8ClampedArray | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioAnalyserRef = useRef<AnalyserNode | null>(null);
  const audioBufferRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarkerInstance | null>(null);
  const faceLandmarkerPromiseRef = useRef<Promise<FaceLandmarkerInstance | null> | null>(null);
  const [marks, setMarks] = useState<FeatureTimingMarks>(emptyMarks);
  const [phase, setPhase] = useState<FeatureCollectorPhase>("idle");
  const [status, setStatus] = useState<FeatureCollectorStatus>("idle");
  const [latestError, setLatestError] = useState<string | null>(null);
  const [payload, setPayload] = useState<FeaturePayload | null>(null);

  const setMark = useCallback((key: keyof FeatureTimingMarks, value = nowMs()) => {
    const nextMarks = { ...marksRef.current, [key]: value };
    marksRef.current = nextMarks;
    setMarks(nextMarks);
    setLatestError(null);
    setPayload(null);
    return value;
  }, []);

  const markRecordingStart = useCallback(() => {
    const value = nowMs();
    const nextMarks = { ...emptyMarks, recordingStartMs: value };
    marksRef.current = nextMarks;
    samplesRef.current = [];
    previousFrameRef.current = null;
    setMarks(nextMarks);
    setPhase("idle");
    setStatus("collecting");
    setLatestError(null);
    setPayload(null);
    return value;
  }, []);

  const markRecordingEnd = useCallback(() => {
    const value = setMark("recordingEndMs");
    setPhase("complete");
    return value;
  }, [setMark]);

  const markWarmupStart = useCallback(() => {
    const value = setMark("warmupStartMs");
    setPhase("warmup");
    setStatus("collecting");
    return value;
  }, [setMark]);

  const markWarmupEnd = useCallback(() => {
    const value = setMark("warmupEndMs");
    setPhase("between");
    return value;
  }, [setMark]);

  const markTargetStart = useCallback(() => {
    const value = setMark("targetStartMs");
    setPhase("target");
    setStatus("collecting");
    return value;
  }, [setMark]);

  const markTargetEnd = useCallback(() => {
    const value = setMark("targetEndMs");
    setPhase("complete");
    return value;
  }, [setMark]);

  const stopSampling = useCallback(() => {
    if (samplerIntervalRef.current !== null) {
      window.clearInterval(samplerIntervalRef.current);
      samplerIntervalRef.current = null;
    }

    mediaSourceRef.current?.disconnect();
    mediaSourceRef.current = null;
    audioAnalyserRef.current = null;
    audioBufferRef.current = null;

    const audioContext = audioContextRef.current;
    audioContextRef.current = null;
    if (audioContext && audioContext.state !== "closed") {
      void audioContext.close();
    }
  }, []);

  const startSampling = useCallback(
    ({ stream, videoElement }: FeatureSamplerInput) => {
      stopSampling();
      samplesRef.current = [];
      previousFrameRef.current = null;

      setupAudioSampler(stream, audioContextRef, mediaSourceRef, audioAnalyserRef, audioBufferRef);
      void getFaceLandmarker(faceLandmarkerRef, faceLandmarkerPromiseRef);

      samplerIntervalRef.current = window.setInterval(() => {
        const sample: FeatureSample = { timestampMs: nowMs() };
        Object.assign(sample, sampleVideoFrame(videoElement, sampleCanvasRef, previousFrameRef));
        Object.assign(sample, sampleAudioFrame(audioAnalyserRef.current, audioBufferRef.current, audioContextRef.current?.sampleRate ?? 44_100));
        Object.assign(sample, sampleFace(videoElement, faceLandmarkerRef.current));

        if (Object.keys(sample).length > 1) {
          samplesRef.current.push(sample);
        }
      }, 250);
    },
    [stopSampling]
  );

  const buildPayload = useCallback(() => {
    const result = buildFeaturePayloadFromMarks(marksRef.current, samplesRef.current);
    setPayload(result.payload);
    setLatestError(result.error);
    setStatus(result.payload ? "ready" : "error");
    return result;
  }, []);

  const reset = useCallback(() => {
    stopSampling();
    marksRef.current = emptyMarks;
    samplesRef.current = [];
    previousFrameRef.current = null;
    setMarks(emptyMarks);
    setPhase("idle");
    setStatus("idle");
    setLatestError(null);
    setPayload(null);
  }, [stopSampling]);

  const canBuildPayload = useMemo(
    () => Object.values(marks).every((value) => value !== null),
    [marks]
  );

  return {
    phase,
    status,
    marks,
    payload,
    latestError,
    canBuildPayload,
    markRecordingStart,
    markRecordingEnd,
    markWarmupStart,
    markWarmupEnd,
    markTargetStart,
    markTargetEnd,
    startSampling,
    stopSampling,
    buildPayload,
    reset
  };
}

function setupAudioSampler(
  stream: MediaStream | null,
  audioContextRef: MutableRefObject<AudioContext | null>,
  mediaSourceRef: MutableRefObject<MediaStreamAudioSourceNode | null>,
  audioAnalyserRef: MutableRefObject<AnalyserNode | null>,
  audioBufferRef: MutableRefObject<Float32Array<ArrayBuffer> | null>
) {
  if (typeof window === "undefined" || !stream?.getAudioTracks().length) return;

  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (!AudioContextConstructor) return;

  try {
    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    const source = audioContext.createMediaStreamSource(stream);
    source.connect(analyser);

    audioContextRef.current = audioContext;
    mediaSourceRef.current = source;
    audioAnalyserRef.current = analyser;
    audioBufferRef.current = new Float32Array(analyser.fftSize);
  } catch {
    audioContextRef.current = null;
    mediaSourceRef.current = null;
    audioAnalyserRef.current = null;
    audioBufferRef.current = null;
  }
}

function sampleVideoFrame(
  videoElement: HTMLVideoElement | null,
  canvasRef: MutableRefObject<HTMLCanvasElement | null>,
  previousFrameRef: MutableRefObject<Uint8ClampedArray | null>
): Partial<FeatureSample> {
  if (!videoElement || videoElement.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return {};

  try {
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;
    canvas.width = 96;
    canvas.height = 54;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return {};

    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    const { data } = image;
    let luminanceSum = 0;
    let centerGreenSum = 0;
    let centerCount = 0;
    let motionSum = 0;
    const previous = previousFrameRef.current;

    for (let index = 0; index < data.length; index += 4) {
      const red = data[index];
      const green = data[index + 1];
      const blue = data[index + 2];
      const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
      luminanceSum += luminance;

      if (previous) {
        motionSum += Math.abs(data[index] - previous[index]) + Math.abs(data[index + 1] - previous[index + 1]) + Math.abs(data[index + 2] - previous[index + 2]);
      }

      const pixel = index / 4;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      if (x > canvas.width * 0.35 && x < canvas.width * 0.65 && y > canvas.height * 0.25 && y < canvas.height * 0.62) {
        centerGreenSum += green / 255;
        centerCount += 1;
      }
    }

    previousFrameRef.current = new Uint8ClampedArray(data);
    const pixelCount = data.length / 4;

    return {
      brightness: round(luminanceSum / pixelCount),
      motionScore: previous ? round(motionSum / (pixelCount * 3 * 255)) : 0,
      rppgSignal: centerCount > 0 ? round(centerGreenSum / centerCount) : 0
    };
  } catch {
    return {};
  }
}

function sampleAudioFrame(
  analyser: AnalyserNode | null,
  buffer: Float32Array<ArrayBuffer> | null,
  sampleRate: number
): Partial<FeatureSample> {
  if (!analyser || !buffer) return {};

  try {
    analyser.getFloatTimeDomainData(buffer);
    let sumSquares = 0;
    for (const value of buffer) {
      sumSquares += value * value;
    }

    return {
      audioEnergy: round(Math.sqrt(sumSquares / buffer.length), 6),
      pitchHz: round(estimatePitchHz(buffer, sampleRate), 2)
    };
  } catch {
    return {};
  }
}

function sampleFace(
  videoElement: HTMLVideoElement | null,
  faceLandmarker: FaceLandmarkerInstance | null
): Partial<FeatureSample> {
  if (!videoElement || !faceLandmarker) return {};

  try {
    const result = faceLandmarker.detectForVideo(videoElement, performance.now());
    const landmarks = result.faceLandmarks?.[0];
    if (!landmarks?.length) return { faceVisible: false };

    const xs = landmarks.map((point) => point.x);
    const ys = landmarks.map((point) => point.y);
    const centerX = average(xs);
    const centerY = average(ys);
    const blendshapeCategories = result.faceBlendshapes?.[0]?.categories ?? [];

    return {
      faceVisible: true,
      blinkScore: Math.max(findBlendshapeScore(blendshapeCategories, "eyeBlinkLeft"), findBlendshapeScore(blendshapeCategories, "eyeBlinkRight")),
      headPoseProxy: round(Math.abs(centerX - 0.5) + Math.abs(centerY - 0.5)),
      mouthMovement: estimateMouthMovement(landmarks),
      gazeOffset: estimateGazeOffset(landmarks)
    };
  } catch {
    return {};
  }
}

async function getFaceLandmarker(
  faceLandmarkerRef: MutableRefObject<FaceLandmarkerInstance | null>,
  faceLandmarkerPromiseRef: MutableRefObject<Promise<FaceLandmarkerInstance | null> | null>
) {
  if (faceLandmarkerRef.current) return faceLandmarkerRef.current;
  if (faceLandmarkerPromiseRef.current) return faceLandmarkerPromiseRef.current;

  faceLandmarkerPromiseRef.current = import("@mediapipe/tasks-vision")
    .then(async ({ FaceLandmarker, FilesetResolver }) => {
      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm");
      const landmarker = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: false,
        runningMode: "VIDEO",
        numFaces: 1
      });
      faceLandmarkerRef.current = landmarker as FaceLandmarkerInstance;
      return faceLandmarkerRef.current;
    })
    .catch(() => null);

  return faceLandmarkerPromiseRef.current;
}

function findBlendshapeScore(categories: Array<{ categoryName?: string; score?: number }>, name: string) {
  return categories.find((category) => category.categoryName === name)?.score ?? 0;
}

function estimateMouthMovement(landmarks: FacePoint[]) {
  const upperLip = landmarks[13];
  const lowerLip = landmarks[14];
  if (!upperLip || !lowerLip) return 0;
  return round(Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y));
}

function estimateGazeOffset(landmarks: FacePoint[]) {
  const leftEye = landmarks[468] ?? landmarks[33];
  const rightEye = landmarks[473] ?? landmarks[263];
  if (!leftEye || !rightEye) return 0;
  const eyeCenterX = (leftEye.x + rightEye.x) / 2;
  const eyeCenterY = (leftEye.y + rightEye.y) / 2;
  return round(Math.hypot(eyeCenterX - 0.5, eyeCenterY - 0.42));
}

function estimatePitchHz(buffer: ArrayLike<number>, sampleRate: number) {
  let bestOffset = -1;
  let bestCorrelation = 0;
  const minOffset = Math.floor(sampleRate / 500);
  const maxOffset = Math.floor(sampleRate / 70);

  for (let offset = minOffset; offset <= maxOffset; offset += 1) {
    let correlation = 0;
    for (let index = 0; index < buffer.length - offset; index += 1) {
      correlation += buffer[index] * buffer[index + offset];
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation;
      bestOffset = offset;
    }
  }

  if (bestOffset <= 0 || bestCorrelation < 0.01) return 0;
  return sampleRate / bestOffset;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number, digits = 4) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
