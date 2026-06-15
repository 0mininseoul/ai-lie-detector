import { targetQuestionMaxLength } from "@/lib/sessions/question-limits";

export const NORMAL_SPEECH_RATE = 1;
export const LONG_QUESTION_SPEECH_RATE = 1.25;

/*
 * The answer-analysis window opens only when narration ends (so the analyzed
 * audio is the answer, not the prompt). A slow read on a long question would
 * leave the respondent staring at the visible text and answering before the
 * window is live — their answer would fall outside the analyzed segment. Reading
 * long prompts ~25% faster shrinks that pre-window gap. "Long" = over half the
 * max question length, derived so it tracks the limit automatically.
 */
export function questionSpeechRate(
  text: string,
  maxLength: number = targetQuestionMaxLength
): number {
  return text.trim().length > maxLength / 2 ? LONG_QUESTION_SPEECH_RATE : NORMAL_SPEECH_RATE;
}

function getSynth(): SpeechSynthesis | undefined {
  return typeof window !== "undefined" ? window.speechSynthesis : undefined;
}

/*
 * iOS WebKit blocks programmatic speech until speechSynthesis has been invoked
 * inside a user gesture. Call this from the tap that starts the session so the
 * later auto-narration is allowed to play.
 */
export function primeSpeech(): void {
  const synth = getSynth();
  if (!synth) return;
  try {
    synth.cancel();
    const unlock = new SpeechSynthesisUtterance(" ");
    unlock.volume = 0;
    synth.speak(unlock);
  } catch {
    // best-effort unlock
  }
}

export type SpeechHandle = { cancel: () => void };

/*
 * Read `text` aloud in Korean, then call `onDone` exactly once. onDone ALSO
 * fires when speech is unavailable, never starts, errors, or stalls (iOS onend
 * is flaky) — the answer window must never hang waiting on the narration.
 */
export function speakQuestion(text: string, onDone: () => void): SpeechHandle {
  const synth = getSynth();
  const trimmed = text.trim();

  let done = false;
  let startCheck = 0;
  let hardCap = 0;

  const finish = () => {
    if (done) return;
    done = true;
    if (typeof window !== "undefined") {
      window.clearTimeout(startCheck);
      window.clearTimeout(hardCap);
    }
    onDone();
  };

  if (!synth || !trimmed) {
    finish();
    return { cancel: finish };
  }

  try {
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(trimmed);
    utterance.lang = "ko-KR";
    utterance.rate = questionSpeechRate(trimmed);
    utterance.onend = finish;
    utterance.onerror = finish;
    synth.speak(utterance);

    // Silent-failure guard: if nothing is queued or speaking shortly after, bail
    // so the answer window still opens.
    startCheck = window.setTimeout(() => {
      if (!synth.speaking && !synth.pending) finish();
    }, 1000);

    // Stuck-utterance guard: bounded max wait even if onend never fires. Longer
    // than any real read of a 42-char prompt so it won't cut narration short.
    hardCap = window.setTimeout(finish, 9000);
  } catch {
    finish();
  }

  return {
    cancel: () => {
      done = true;
      window.clearTimeout(startCheck);
      window.clearTimeout(hardCap);
      try {
        synth.cancel();
      } catch {
        // ignore
      }
    }
  };
}
