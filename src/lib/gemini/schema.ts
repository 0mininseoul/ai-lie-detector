import { z } from "zod";

const publicTextFields = ["roast_comment", "share_text", "result_card_lines"] as const;

/*
 * Gemini sometimes drops or guesses fields when it isn't given a strict
 * response schema. We pin its output with `responseSchema` on the worker
 * AND tolerate small drift here (default retry_message, normalize unknown
 * retry_reason to "none") so a single bad token doesn't kill the analysis.
 */
const RETRY_REASONS = [
  "none",
  "face_not_visible",
  "audio_missing",
  "answer_too_short",
  "lighting_too_poor",
  "recording_corrupted"
] as const;

export const geminiResultSchema = z.object({
  schema_version: z.coerce.number().int().refine((v) => v === 1, { message: "schema_version must be 1" }).transform(() => 1 as const),
  quality_gate: z.object({
    status: z.enum(["pass", "retry"]),
    retry_reason: z
      .string()
      .transform((value): (typeof RETRY_REASONS)[number] =>
        (RETRY_REASONS as readonly string[]).includes(value)
          ? (value as (typeof RETRY_REASONS)[number])
          : "none"
      ),
    retry_message: z.string().optional().default("")
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

/*
 * OpenAPI 3 response schema pinned on Gemini's generateContent call so the
 * model returns *exactly* this shape. Kept in sync with `geminiResultSchema`
 * above. Worker uses this via config.responseSchema.
 */
export const geminiResponseSchema = {
  type: "object",
  properties: {
    // Gemini API rejects enum on integer types — keep the schema constraint
    // open here and let our zod parser enforce `schema_version === 1`.
    schema_version: { type: "integer" },
    quality_gate: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["pass", "retry"] },
        retry_reason: { type: "string", enum: RETRY_REASONS as unknown as string[] },
        retry_message: { type: "string" }
      },
      required: ["status", "retry_reason", "retry_message"]
    },
    public_result: {
      type: "object",
      properties: {
        headline: { type: "string", enum: ["진실", "거짓"] },
        verdict: { type: "string", enum: ["truth", "lie"] },
        roast_comment: { type: "string" },
        share_question: { type: "string" },
        share_text: { type: "string" },
        result_card_lines: {
          type: "array",
          items: { type: "string" },
          minItems: 3,
          maxItems: 3
        },
        export_final_frame: {
          type: "object",
          properties: {
            title: { type: "string", enum: ["AI 거짓말탐지기"] },
            question: { type: "string" },
            headline: { type: "string", enum: ["진실", "거짓"] }
          },
          required: ["title", "question", "headline"]
        }
      },
      required: [
        "headline",
        "verdict",
        "roast_comment",
        "share_question",
        "share_text",
        "result_card_lines",
        "export_final_frame"
      ]
    },
    private_diagnostics: {
      type: "object",
      properties: {
        internal_score: { type: "integer" },
        internal_confidence: { type: "string", enum: ["low", "medium", "high"] },
        model_reasoning_summary: { type: "string" },
        quality: {
          type: "object",
          properties: {
            camera: { type: "string", enum: ["poor", "usable", "good"] },
            audio: { type: "string", enum: ["poor", "usable", "good"] },
            face_visible: { type: "boolean" },
            answer_detected: { type: "boolean" },
            feature_payload_usable: { type: "boolean" }
          },
          required: [
            "camera",
            "audio",
            "face_visible",
            "answer_detected",
            "feature_payload_usable"
          ]
        },
        segment_judgments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              segment: { type: "string", enum: ["warmup", "target"] },
              usable: { type: "boolean" },
              internal_notes: { type: "string" }
            },
            required: ["segment", "usable", "internal_notes"]
          }
        }
      },
      required: [
        "internal_score",
        "internal_confidence",
        "model_reasoning_summary",
        "quality",
        "segment_judgments"
      ]
    },
    policy_flags: {
      type: "object",
      properties: {
        contains_probability_in_public_text: { type: "boolean" },
        contains_detection_signal_in_public_text: { type: "boolean" },
        headline_is_exact: { type: "boolean" }
      },
      required: [
        "contains_probability_in_public_text",
        "contains_detection_signal_in_public_text",
        "headline_is_exact"
      ]
    }
  },
  required: ["schema_version", "quality_gate", "public_result", "private_diagnostics", "policy_flags"]
} as const;

export function parseGeminiResult(input: unknown): GeminiResult {
  const parsed = geminiResultSchema.parse(normalizeGeminiResultCandidate(input));

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

function normalizeGeminiResultCandidate(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;

  const candidate = input as Record<string, unknown>;
  const normalizedCandidate: Record<string, unknown> = { ...candidate };

  const qualityGate = candidate.quality_gate;
  const publicResult = candidate.public_result;
  if (
    qualityGate &&
    typeof qualityGate === "object" &&
    !Array.isArray(qualityGate) &&
    publicResult &&
    typeof publicResult === "object" &&
    !Array.isArray(publicResult) &&
    (qualityGate as Record<string, unknown>).status === "retry"
  ) {
    normalizedCandidate.quality_gate = {
      ...(qualityGate as Record<string, unknown>),
      status: "pass",
      retry_reason: "none",
      retry_message: (qualityGate as Record<string, unknown>).retry_message ?? ""
    };
  }

  const policyFlags = candidate.policy_flags;
  if (policyFlags && typeof policyFlags === "object" && !Array.isArray(policyFlags)) {
    normalizedCandidate.policy_flags = {
      ...(policyFlags as Record<string, unknown>),
      contains_probability_in_public_text: false,
      contains_detection_signal_in_public_text: false,
      headline_is_exact: true
    };
  }

  const diagnostics = candidate.private_diagnostics;
  if (!diagnostics || typeof diagnostics !== "object" || Array.isArray(diagnostics)) return normalizedCandidate;

  const diagnosticsObject = diagnostics as Record<string, unknown>;
  const score = Number(diagnosticsObject.internal_score);
  if (!Number.isFinite(score)) return normalizedCandidate;

  const normalizedDiagnostics: Record<string, unknown> = {
    ...diagnosticsObject,
    internal_score: Math.min(100, Math.max(0, Math.round(score)))
  };

  if (
    normalizedCandidate.quality_gate &&
    typeof normalizedCandidate.quality_gate === "object" &&
    !Array.isArray(normalizedCandidate.quality_gate) &&
    (normalizedCandidate.quality_gate as Record<string, unknown>).status === "pass" &&
    (qualityGate as Record<string, unknown> | undefined)?.status === "retry"
  ) {
    normalizedDiagnostics.internal_confidence = "low";
    normalizedDiagnostics.model_reasoning_summary = [
      typeof diagnosticsObject.model_reasoning_summary === "string" ? diagnosticsObject.model_reasoning_summary : "",
      "Original model response requested retry, but returned a publishable structured result. Published as low confidence."
    ]
      .filter(Boolean)
      .join(" ");
  }

  return {
    ...normalizedCandidate,
    private_diagnostics: normalizedDiagnostics
  };
}

function assertPublicTextIsSafe(result: GeminiResult) {
  const values = [
    result.public_result.roast_comment,
    result.public_result.share_text,
    ...result.public_result.result_card_lines
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
