import { describe, expect, it } from "vitest";
import {
  LONG_QUESTION_SPEECH_RATE,
  NORMAL_SPEECH_RATE,
  questionSpeechRate,
  speakQuestion
} from "@/lib/sessions/speech";
import { targetQuestionMaxLength } from "@/lib/sessions/question-limits";

describe("questionSpeechRate", () => {
  const half = targetQuestionMaxLength / 2; // 21

  it("reads short questions at normal speed", () => {
    expect(questionSpeechRate("어제 뭐 했어?")).toBe(NORMAL_SPEECH_RATE);
  });

  it("speeds up the longest allowed question so the answer window opens sooner", () => {
    expect(questionSpeechRate("가".repeat(targetQuestionMaxLength))).toBe(
      LONG_QUESTION_SPEECH_RATE
    );
  });

  it("switches to fast above half the max length", () => {
    expect(questionSpeechRate("가".repeat(half))).toBe(NORMAL_SPEECH_RATE); // 21 → normal
    expect(questionSpeechRate("가".repeat(half + 1))).toBe(LONG_QUESTION_SPEECH_RATE); // 22 → fast
  });

  it("measures the trimmed length", () => {
    expect(questionSpeechRate(`   ${"가".repeat(10)}   `)).toBe(NORMAL_SPEECH_RATE);
  });
});

describe("speakQuestion fallback", () => {
  it("still calls onDone when speech synthesis is unavailable", () => {
    // node test env has no window/speechSynthesis: the answer window must not hang.
    let opened = false;
    speakQuestion("아무 질문", () => {
      opened = true;
    });
    expect(opened).toBe(true);
  });
});
