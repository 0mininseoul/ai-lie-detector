import { z } from "zod";

const publicTextFields = ["roast_comment", "share_question", "share_text", "result_card_lines", "export_final_frame.question"] as const;

export const geminiResultSchema = z.object({
  schema_version: z.literal(1),
  quality_gate: z.object({
    status: z.enum(["pass", "retry"]),
    retry_reason: z.enum([
      "none",
      "face_not_visible",
      "audio_missing",
      "answer_too_short",
      "lighting_too_poor",
      "recording_corrupted"
    ]),
    retry_message: z.string()
  }).strict(),
  public_result: z.object({
    headline: z.enum(["진실", "거짓"]),
    verdict: z.enum(["truth", "lie"]),
    roast_comment: z.string().min(12).max(120),
    share_question: z.string().min(1).max(160),
    share_text: z.string().min(1).max(180),
    result_card_lines: z.array(z.string().max(80)).length(3),
    export_final_frame: z.object({
      title: z.literal("AI 거짓말탐지기"),
      question: z.string().min(1).max(160),
      headline: z.enum(["진실", "거짓"])
    }).strict()
  }).strict(),
  private_diagnostics: z.object({
    internal_score: z.number().int().min(0).max(100),
    internal_confidence: z.enum(["low", "medium", "high"]),
    model_reasoning_summary: z.string().max(1000),
    quality: z.object({
      camera: z.enum(["poor", "usable", "good"]),
      audio: z.enum(["poor", "usable", "good"]),
      face_visible: z.boolean(),
      answer_detected: z.boolean(),
      feature_payload_usable: z.boolean()
    }),
    segment_judgments: z.array(
      z.object({
        segment: z.enum(["warmup", "target"]),
        usable: z.boolean(),
        internal_notes: z.string().max(500)
      }).strict()
    )
  }).strict(),
  policy_flags: z.object({
    contains_probability_in_public_text: z.literal(false),
    contains_detection_signal_in_public_text: z.literal(false),
    headline_is_exact: z.literal(true)
  }).strict()
}).strict();

export type GeminiResult = z.infer<typeof geminiResultSchema>;

export function parseGeminiResult(input: unknown): GeminiResult {
  const parsed = geminiResultSchema.parse(input);

  if (parsed.quality_gate.status === "retry") {
    throw new Error("Retry result is not publishable");
  }

  if (parsed.public_result.headline === "진실" && parsed.public_result.verdict !== "truth") {
    throw new Error("Headline/verdict mismatch");
  }

  if (parsed.public_result.headline === "거짓" && parsed.public_result.verdict !== "lie") {
    throw new Error("Headline/verdict mismatch");
  }

  if (parsed.public_result.export_final_frame.headline !== parsed.public_result.headline) {
    throw new Error("Export headline mismatch");
  }

  if (parsed.quality_gate.status === "pass" && parsed.quality_gate.retry_reason !== "none") {
    throw new Error("Quality gate pass cannot include retry reason");
  }

  assertPublicTextIsSafe(parsed);
  assertSegmentJudgmentsComplete(parsed.private_diagnostics.segment_judgments);

  return parsed;
}

function assertPublicTextIsSafe(result: GeminiResult) {
  const values = [
    result.public_result.roast_comment,
    result.public_result.share_question,
    result.public_result.share_text,
    ...result.public_result.result_card_lines,
    result.public_result.export_final_frame.question
  ];

  values.forEach((value, index) => {
    if (containsForbiddenPublicText(value)) {
      throw new Error(`Forbidden public text in ${publicTextFields[index] ?? "public_text"}`);
    }
  });
}

function containsForbiddenPublicText(value: string): boolean {
  return /(\d+(?:\.\d+)?\s*%|확률|가능성|confidence|점수|score|수상한|감지|시선|눈동자|눈 깜빡|깜빡임|심박|맥박|혈류|rPPG|목소리|음성|피치|떨림|표정 변화|고개 움직임|feature|signal)/i.test(value);
}

function assertSegmentJudgmentsComplete(segmentJudgments: GeminiResult["private_diagnostics"]["segment_judgments"]) {
  const segments = new Set(segmentJudgments.map((judgment) => judgment.segment));
  if (segmentJudgments.length !== 2 || !segments.has("warmup") || !segments.has("target")) {
    throw new Error("Segment judgments must contain exactly warmup and target");
  }
}
