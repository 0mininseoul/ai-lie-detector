import { describe, expect, it } from "vitest";
import { parseGeminiResult } from "@/lib/gemini/schema";

const baseResult = {
  schema_version: 1,
  quality_gate: { status: "pass", retry_reason: "none", retry_message: "" },
  public_result: {
    headline: "거짓",
    verdict: "lie",
    roast_comment: "구라도 실력입니다 선생님. 조금 더 노력하세요.",
    share_question: "어제 누구랑 있었어?",
    share_text: "질문: 어제 누구랑 있었어? / 판정: 거짓",
    result_card_lines: ["AI 거짓말탐지기", "질문: 어제 누구랑 있었어?", "판정: 거짓"],
    export_final_frame: {
      title: "AI 거짓말탐지기",
      question: "어제 누구랑 있었어?",
      headline: "거짓"
    }
  },
  private_diagnostics: {
    internal_score: 82,
    internal_confidence: "high",
    model_reasoning_summary: "internal only",
    quality: {
      camera: "good",
      audio: "good",
      face_visible: true,
      answer_detected: true,
      feature_payload_usable: true
    },
    segment_judgments: [
      { segment: "warmup", usable: true, internal_notes: "usable" },
      { segment: "target", usable: true, internal_notes: "usable" }
    ]
  },
  policy_flags: {
    contains_probability_in_public_text: false,
    contains_detection_signal_in_public_text: false,
    headline_is_exact: true
  }
};

describe("parseGeminiResult", () => {
  it("accepts an exact lie headline", () => {
    expect(parseGeminiResult(baseResult).public_result.headline).toBe("거짓");
  });

  it("rejects headline text with extra copy", () => {
    expect(() =>
      parseGeminiResult({
        ...baseResult,
        public_result: { ...baseResult.public_result, headline: "거짓. 표정 관리 실패" }
      })
    ).toThrow();
  });

  it("normalizes unreliable self-reported public policy flags", () => {
    expect(
      parseGeminiResult({
        ...baseResult,
        policy_flags: {
          ...baseResult.policy_flags,
          contains_probability_in_public_text: true,
          contains_detection_signal_in_public_text: true
        }
      }).policy_flags.contains_probability_in_public_text
    ).toBe(false);
  });

  it("clamps out-of-range private scores instead of failing publishable results", () => {
    const parsed = parseGeminiResult({
      ...baseResult,
      private_diagnostics: {
        ...baseResult.private_diagnostics,
        internal_score: -3
      }
    });

    expect(parsed.private_diagnostics.internal_score).toBe(0);
  });

  it("rejects extra public result fields", () => {
    expect(() =>
      parseGeminiResult({
        ...baseResult,
        public_result: { ...baseResult.public_result, probability: 82 }
      })
    ).toThrow();
  });

  it("rejects forbidden public probability text even when flags are false", () => {
    expect(() =>
      parseGeminiResult({
        ...baseResult,
        public_result: { ...baseResult.public_result, roast_comment: "거짓 확률 82%입니다." }
      })
    ).toThrow();
  });

  it("rejects forbidden public detection signal text", () => {
    expect(() =>
      parseGeminiResult({
        ...baseResult,
        public_result: { ...baseResult.public_result, share_text: "질문: 어제 누구랑 있었어? / 시선 흔들림 감지" }
      })
    ).toThrow();
  });

  it("rejects export headline mismatch", () => {
    expect(() =>
      parseGeminiResult({
        ...baseResult,
        public_result: {
          ...baseResult.public_result,
          export_final_frame: { ...baseResult.public_result.export_final_frame, headline: "진실" }
        }
      })
    ).toThrow();
  });

  it("publishes retry-shaped results as low-confidence when public output is valid", () => {
    const parsed = parseGeminiResult({
      ...baseResult,
      quality_gate: { status: "retry", retry_reason: "none", retry_message: "" }
    });

    expect(parsed.quality_gate.status).toBe("pass");
    expect(parsed.quality_gate.retry_reason).toBe("none");
    expect(parsed.private_diagnostics.internal_confidence).toBe("low");
  });

  it("does not fail publishable sessions just because Gemini requested retry", () => {
    const parsed = parseGeminiResult({
      ...baseResult,
      quality_gate: { status: "retry", retry_reason: "audio_missing", retry_message: "소리가 거의 안 들어왔어. 다시 해보자." }
    });

    expect(parsed.quality_gate.status).toBe("pass");
    expect(parsed.private_diagnostics.internal_confidence).toBe("low");
  });

  it("rejects missing segment judgments", () => {
    expect(() =>
      parseGeminiResult({
        ...baseResult,
        private_diagnostics: {
          ...baseResult.private_diagnostics,
          segment_judgments: [{ segment: "target", usable: true, internal_notes: "usable" }]
        }
      })
    ).toThrow();
  });
});
