import { z } from "zod";
import { assertValidSessionTimings } from "@/lib/recording/features";

const warmupQuestion = "오늘 하루 중 제일 기억나는 일 뭐야?";

/*
 * Timings come from performance.now() (DOMHighResTimeStamp) which returns
 * float values — z.number().int() rejects those at parse time. Accept any
 * finite number and round to the nearest integer before downstream use so
 * the DB integer columns stay safe.
 */
const positiveIntMsSchema = z
  .number()
  .finite()
  .positive()
  .max(2_147_483_647)
  .transform((value) => Math.round(value));

const nonnegativeIntMsSchema = z
  .number()
  .finite()
  .nonnegative()
  .max(2_147_483_647)
  .transform((value) => Math.round(value));

const positiveIntBytesSchema = z
  .number()
  .finite()
  .positive()
  .max(2_147_483_647)
  .transform((value) => Math.round(value));

const segmentSchema = z.object({
  segment: z.enum(["warmup", "target"]),
  value: z.number().finite()
}).strict();

const questionValueSchema = z.object({
  question: z.enum(["warmup", "target"]),
  value: z.number().finite()
}).strict();

const sessionTimingsSchema = z.object({
  durationMs: positiveIntMsSchema,
  warmupStartMs: nonnegativeIntMsSchema,
  warmupEndMs: nonnegativeIntMsSchema,
  targetStartMs: nonnegativeIntMsSchema,
  targetEndMs: nonnegativeIntMsSchema
}).strict();

export const featurePayloadSchema = z.object({
  version: z.literal(1),
  extraction: z.object({
    status: z.enum(["unavailable", "partial", "complete"]),
    notes: z.array(z.string().max(500)).max(20)
  }).strict(),
  session: sessionTimingsSchema,
  videoQuality: z.object({
    faceVisibleRatio: z.number().finite().nonnegative(),
    avgBrightness: z.number().finite().nonnegative(),
    motionBlurScore: z.number().finite().nonnegative(),
    droppedFrameRatio: z.number().finite().nonnegative()
  }).strict(),
  face: z.object({
    samplesPerSecond: z.number().finite().nonnegative(),
    blinkRateBySegment: z.array(segmentSchema),
    headPoseVarianceBySegment: z.array(segmentSchema),
    mouthMovementBySegment: z.array(segmentSchema),
    faceStabilityBySegment: z.array(segmentSchema)
  }).strict(),
  gaze: z.object({
    gazeStabilityBySegment: z.array(segmentSchema),
    screenAttentionBySegment: z.array(segmentSchema)
  }).strict(),
  audio: z.object({
    speechDetected: z.boolean(),
    responseLatencyMsByQuestion: z.array(questionValueSchema),
    pitchVarianceBySegment: z.array(segmentSchema),
    energyVarianceBySegment: z.array(segmentSchema),
    pauseRatioBySegment: z.array(segmentSchema)
  }).strict(),
  rppg: z.object({
    quality: z.enum(["good", "weak", "unusable"]),
    bpmEstimateBySegment: z.array(segmentSchema),
    signalVarianceBySegment: z.array(segmentSchema)
  }).strict()
}).strict();

export const createSessionSchema = z.object({
  creatorDeviceId: z.string().trim().min(8).max(128),
  targetQuestion: z.string().trim().min(3).max(160),
  locale: z.literal("ko").default("ko")
}).strict();

export const completeUploadSchema = z.object({
  r2Key: z.string().trim().min(1).max(1024),
  mimeType: z.string().trim().min(1).max(255).refine(
    (mimeType) => mimeType.startsWith("video/webm") || mimeType.startsWith("video/mp4"),
    "mimeType must be a supported video MIME type"
  ),
  byteSize: positiveIntBytesSchema,
  durationMs: positiveIntMsSchema,
  warmupStartMs: nonnegativeIntMsSchema,
  warmupEndMs: nonnegativeIntMsSchema,
  targetStartMs: nonnegativeIntMsSchema,
  targetEndMs: nonnegativeIntMsSchema,
  featurePayload: featurePayloadSchema
}).strict();

export type CreateSessionInput = z.infer<typeof createSessionSchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;

export function parseCreateSessionInput(input: unknown): CreateSessionInput {
  return createSessionSchema.parse(input);
}

export function parseCompleteUploadInput(input: unknown): CompleteUploadInput {
  const parsed = completeUploadSchema.parse(input);
  const timings = {
    durationMs: parsed.durationMs,
    warmupStartMs: parsed.warmupStartMs,
    warmupEndMs: parsed.warmupEndMs,
    targetStartMs: parsed.targetStartMs,
    targetEndMs: parsed.targetEndMs
  };

  assertValidSessionTimings(timings);
  assertValidSessionTimings(parsed.featurePayload.session);

  if (JSON.stringify(parsed.featurePayload.session) !== JSON.stringify(timings)) {
    throw new Error("featurePayload session timings must match upload timings");
  }

  return parsed;
}

export function assertR2KeyMatchesSession(r2Key: string, sessionId: string) {
  const expectedPrefix = `recordings/${sessionId}/`;

  if (!r2Key.startsWith(expectedPrefix)) {
    throw new Error("r2Key must belong to the session");
  }
}

export function getWarmupQuestion() {
  return warmupQuestion;
}
