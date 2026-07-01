import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const recorder = readFileSync(join(process.cwd(), "src/app/s/[id]/SessionRecorder.tsx"), "utf8");
const recorderHook = readFileSync(join(process.cwd(), "src/hooks/useCameraRecorder.ts"), "utf8");
const featureCollector = readFileSync(join(process.cwd(), "src/hooks/useFeatureCollector.ts"), "utf8");
const hudCss = readFileSync(join(process.cwd(), "src/components/analysis/LiveAnalysisHud.module.css"), "utf8");
const hudMobileCss = hudCss.slice(hudCss.indexOf("@media (max-width: 720px)"));

function selectorBlock(css: string, selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  if (!match) throw new Error(`Missing block for ${selector}`);
  return match[1];
}

describe("session recorder mobile flow", () => {
  it("uses 5-second automatic answer windows without manual friction", () => {
    expect(recorder).not.toContain("between");
    expect(recorder).not.toContain("대답 완료");
    expect(recorder).not.toContain("진짜 질문 보기");
    expect(recorder).not.toContain("지금 끝내기");
    expect(recorder).not.toContain("5초 안에 답해 주세요");
    expect(recorder).not.toContain("0초가 되는 순간");
    expect(recorder).not.toContain("질문을 잘 들어 주세요");
    expect((recorder.match(/durationMs=\{5000\}/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("plays an automatic fullscreen beat between warmup and the real question", () => {
    // The beat is its own phase and advances on a timer, never a tap — manual
    // friction stays banished while the shift in stakes gets a moment to land.
    expect(recorder).toContain('phase === "transition"');
    expect(recorder).toContain("이제, 진짜 질문입니다");
    expect(recorder).toContain("startTargetRef.current()");
    expect(recorder).toContain("const TRANSITION_MS");
    // markTargetStart must fire when the beat ends, not when warmup ends, so the
    // overlay never lands inside the analyzed target window.
    const warmupEndIndex = recorder.indexOf("markWarmupEnd()");
    const targetStartIndex = recorder.indexOf("markTargetStart()");
    const transitionPhaseIndex = recorder.indexOf('setPhase("transition")');
    expect(transitionPhaseIndex).toBeGreaterThan(warmupEndIndex);
    expect(targetStartIndex).toBeGreaterThan(transitionPhaseIndex);
  });

  it("opens the target answer window directly without text-to-speech narration", () => {
    expect(recorder).not.toContain("primeSpeech");
    expect(recorder).not.toContain("speakQuestion");
    expect(recorder).not.toContain("speechSynthesis");
    expect(recorder).toContain("void openAnswerWindowRef.current()");
  });

  it("does not reveal the target question until the target recording is live", () => {
    const startTargetBlock = recorder.slice(
      recorder.indexOf("const startTarget"),
      recorder.indexOf("// Open the analyzed answer window")
    );
    const openAnswerWindowBlock = recorder.slice(
      recorder.indexOf("const openAnswerWindow"),
      recorder.indexOf("const startTargetRef")
    );

    expect(startTargetBlock).not.toContain('setPhase("target")');
    expect(openAnswerWindowBlock.indexOf("const targetSliceReady = await recorder.startNewRecordingSlice()")).toBeLessThan(
      openAnswerWindowBlock.indexOf('setPhase("target")')
    );
    expect(openAnswerWindowBlock.indexOf("featureCollector.markTargetStart()")).toBeLessThan(
      openAnswerWindowBlock.indexOf('setPhase("target")')
    );
  });

  it("resets submit state only on the error path, never after a successful finish", () => {
    // A `finally` that reset isSubmitting ran on the success path too (finally
    // runs after the `return`), flipping the countdown ring active again and
    // making it recount 5,4 during slow iOS client-nav to the result page.
    // The reset must live in the catch block, after we enter the error phase.
    expect(recorder).not.toContain("} finally {");
    const errorIndex = recorder.indexOf('setPhase("error")');
    const resetSubmitIndex = recorder.indexOf("setIsSubmitting(false)");
    expect(errorIndex).toBeGreaterThan(-1);
    expect(resetSubmitIndex).toBeGreaterThan(errorIndex);
  });

  it("keeps setup guidance scannable in a single checklist card", () => {
    expect(recorder).toContain("styles.guidanceCard");
    expect(recorder).toContain("styles.guidanceRow");
    expect(recorder).toContain('data-check="face"');
    expect(recorder).toContain('data-check="light"');
    expect(recorder).toContain('data-check="voice"');
    expect(recorder).toContain("가벼운 질문 5초");
  });

  it("waits for upload completion before moving to the result page", () => {
    const localStoreIndex = recorder.indexOf("recordingLocalStore.set(");
    const uploadIndex = recorder.indexOf("await completeSplitRecordingUpload");
    const routeIndex = recorder.indexOf("router.replace(`/result/${session.id}`)");

    expect(localStoreIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(localStoreIndex);
    expect(routeIndex).toBeGreaterThan(uploadIndex);
    expect(recorder).not.toContain("recordingLocalStore.setUploadPromise");
  });

  it("uploads the warmup clip in the background before the target answer finishes", () => {
    expect(recorder).toContain("warmupUploadPromiseRef");
    expect(recorder).toContain('uploadRecordingSegment("warmup"');
    expect(recorder).toContain('uploadRecordingSegment("target"');
    expect(recorder).toContain("void warmupUploadPromise.catch");
    expect(recorder).toContain("targetUploadSource.blob");
  });

  it("does not stop and restart MediaRecorder between warmup and target", () => {
    const finishWarmupBlock = recorder.slice(
      recorder.indexOf("const finishWarmup"),
      recorder.indexOf("// Transition beat ends")
    );
    const openAnswerWindowBlock = recorder.slice(
      recorder.indexOf("const openAnswerWindow"),
      recorder.indexOf("const startTargetRef")
    );

    expect(recorderHook).toContain("captureRecordingSlice");
    expect(recorderHook).toContain("startNewRecordingSlice");
    expect(recorderHook).toContain("recorder.requestData()");
    expect(recorderHook).toContain("dataWaitersRef");
    expect(recorderHook).toContain("sliceChunkStartIndexRef");
    expect(finishWarmupBlock).toContain("await recorder.captureRecordingSlice()");
    expect(finishWarmupBlock).not.toContain("recorder.stopRecording()");
    expect(openAnswerWindowBlock).toContain("await recorder.startNewRecordingSlice()");
    expect(openAnswerWindowBlock).not.toContain("await recorder.startRecording()");
  });

  it("logs client recorder boundaries around warmup and target slicing", () => {
    expect(recorder).toContain("logClientEvent");
    expect(recorder).toContain('event: "warmup_timer_started"');
    expect(recorder).toContain('event: "warmup_timer_completed"');
    expect(recorder).toContain('event: "warmup_stop_requested"');
    expect(recorder).toContain('event: "warmup_stop_resolved"');
    expect(recorder).toContain('event: "warmup_blob_empty"');
    expect(recorder).toContain('event: "target_slice_started"');
    expect(recorder).toContain('event: "target_stop_resolved"');
  });

  it("backs off local feature sampling to reduce iOS recorder pressure", () => {
    expect(featureCollector).toContain("const featureSampleIntervalMs = 200");
    expect(featureCollector).toContain("window.setInterval");
    expect(featureCollector).toContain("featureSampleIntervalMs");
  });

  it("uses the timer-derived target window for local playback and uploaded target timing", () => {
    expect(recorder).toContain("const targetWindowDurationMs = Math.max(1, timings.targetEndMs - timings.targetStartMs)");
    expect(recorder).toContain("const targetSegmentDurationMs = Math.min(targetRecording.durationMs, targetWindowDurationMs)");
    expect(recorder).toContain("const targetSegmentUpload = {");
    expect(recorder).toContain("...targetUpload");
    expect(recorder).toContain("shouldUseFullRecordingForTarget ? targetUploadSource.durationMs : targetSegmentDurationMs");
    expect(recorder).toContain("targetEndMs: targetSegmentDurationMs");
    expect(recorder).toContain("target: targetSegmentUpload");
  });

  it("keeps a full recording blob when the final target slice is a fragmented MP4", () => {
    expect(recorderHook).toContain("fullBlob?: Blob");
    expect(recorderHook).toContain("fullDurationMs?: number");
    expect(recorderHook).toContain("fullSizeBytes?: number");
    expect(recorderHook).toContain("const fullChunks = chunksRef.current");
    expect(recorderHook).toContain("fullBlob");
  });

  it("falls back to the full recording when the target MP4 slice is not standalone", () => {
    expect(recorder).toContain("blobLooksLikeStandaloneMp4");
    expect(recorder).toContain("const targetIsStandalone = await blobLooksLikeStandaloneMp4(targetRecording.blob)");
    expect(recorder).toContain("const shouldUseFullRecordingForTarget");
    expect(recorder).toContain("targetUploadSource");
    expect(recorder).toContain("event: \"target_upload_source_selected\"");
    expect(recorder).toContain("usedFullRecording: Boolean(shouldUseFullRecordingForTarget)");
    expect(recorder).toContain("targetStartMs: timings.targetStartMs");
    expect(recorder).toContain("targetEndMs: timings.targetEndMs");
    expect(recorder).toContain("uploadRecordingSegment(\"target\", targetUploadSource)");
  });

  it("moves live metrics away from the face center on mobile", () => {
    const sideMetrics = selectorBlock(hudMobileCss, ".sideMetrics");
    const topBar = selectorBlock(hudMobileCss, ".topBar");

    expect(recorder).toContain("targetPanelRef");
    expect(recorder).toContain("ResizeObserver");
    expect(recorder).toContain("--analysis-hud-top");
    expect(topBar).toContain("top: var(--analysis-hud-top");
    expect(sideMetrics).toContain("top: auto");
    expect(sideMetrics).toContain("bottom: 86px");
    expect(sideMetrics).toContain("transform: none");
    expect(sideMetrics).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
  });

  it("projects face tracking against the rendered video element", () => {
    expect(recorder).toContain("videoElementRef={recorder.videoRef}");
  });
});
