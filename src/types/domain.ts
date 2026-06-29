export type QuestionType = "warmup" | "target";
export type RecordingSegment = "warmup" | "target";
export type Verdict = "truth" | "lie";
export type Headline = "진실" | "거짓";

export type SessionStatus =
  | "created"
  | "recording"
  | "uploaded"
  | "analyzing"
  | "complete"
  | "failed"
  | "expired";

export type FeaturePayload = {
  version: 1;
  extraction: {
    status: "unavailable" | "partial" | "complete";
    notes: string[];
  };
  session: {
    durationMs: number;
    warmupStartMs: number;
    warmupEndMs: number;
    targetStartMs: number;
    targetEndMs: number;
  };
  videoQuality: {
    faceVisibleRatio: number;
    avgBrightness: number;
    motionBlurScore: number;
    droppedFrameRatio: number;
  };
  face: {
    samplesPerSecond: number;
    blinkRateBySegment: SegmentValue[];
    headPoseVarianceBySegment: SegmentValue[];
    mouthMovementBySegment: SegmentValue[];
    faceStabilityBySegment: SegmentValue[];
  };
  gaze: {
    gazeStabilityBySegment: SegmentValue[];
    screenAttentionBySegment: SegmentValue[];
  };
  audio: {
    speechDetected: boolean;
    responseLatencyMsByQuestion: QuestionValue[];
    pitchVarianceBySegment: SegmentValue[];
    energyVarianceBySegment: SegmentValue[];
    pauseRatioBySegment: SegmentValue[];
  };
  rppg: {
    quality: "good" | "weak" | "unusable";
    bpmEstimateBySegment: SegmentValue[];
    signalVarianceBySegment: SegmentValue[];
  };
};

export type SegmentValue = {
  segment: QuestionType;
  value: number;
};

export type QuestionValue = {
  question: QuestionType;
  value: number;
};
