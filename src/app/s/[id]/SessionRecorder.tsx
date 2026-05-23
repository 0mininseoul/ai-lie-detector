"use client";

import { AudioLines, Camera, Gift, Mic, Play, RotateCcw, ScanFace, Smile, SunMedium } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CountdownRing } from "@/components/analysis/CountdownRing";
import { LiveAnalysisHud } from "@/components/analysis/LiveAnalysisHud";
import { TelemetryStrip } from "@/components/analysis/TelemetryStrip";
import { useCameraRecorder } from "@/hooks/useCameraRecorder";
import { useFeatureCollector } from "@/hooks/useFeatureCollector";
import { recordingLocalStore } from "@/lib/recording/local-store";
import styles from "./session.module.css";

type RefundState = "idle" | "pending" | "granted" | "failed";

type SessionRecorderProps = {
  session: {
    id: string;
    status: string;
    targetQuestion: string;
    warmupQuestion: string;
  };
};

type FlowPhase = "setup" | "warmup" | "target" | "error";

type UploadUrlResponse = {
  uploadUrl?: string;
  r2Key?: string;
  requiredHeaders?: Record<string, string>;
  error?: string;
};

function getInitialPhase(status: string): FlowPhase {
  if (status === "failed" || status === "expired") return "error";
  return "setup";
}

function getInitialError(status: string) {
  if (status === "failed") return "분석이 실패했습니다. 이번 판은 다시 진행해 주세요.";
  if (status === "expired") return "이번 판은 시간이 지나 만료되었습니다.";
  return "";
}

export function SessionRecorder({ session }: SessionRecorderProps) {
  const router = useRouter();
  const recorder = useCameraRecorder();
  const featureCollector = useFeatureCollector();
  const { stopCamera } = recorder;
  const { stopSampling } = featureCollector;
  const stopCameraRef = useRef(stopCamera);
  const stopSamplingRef = useRef(stopSampling);
  const [phase, setPhase] = useState<FlowPhase>(() => getInitialPhase(session.status));
  const [error, setError] = useState(() => getInitialError(session.status));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requiresNewSession, setRequiresNewSession] = useState(() => ["failed", "expired"].includes(session.status));
  const [refundState, setRefundState] = useState<RefundState>("idle");

  const currentQuestion = useMemo(() => {
    if (phase === "warmup") return session.warmupQuestion;
    if (phase === "target") return session.targetQuestion;
    return "";
  }, [phase, session.targetQuestion, session.warmupQuestion]);

  const startCameraRef = useRef(recorder.startCamera);
  useEffect(() => {
    startCameraRef.current = recorder.startCamera;
  }, [recorder.startCamera]);

  /*
   * Auto-request camera + mic the moment the user lands on this page in the
   * setup phase. The browser's native permission dialog is the right UI for
   * granting access — a separate "확인하기" button just adds a click that
   * everyone has to make anyway. iOS/Android both honor a fresh getUserMedia
   * call on page load over HTTPS, and if the user previously denied the
   * permission the call rejects immediately so we can surface the retry
   * affordance on the same screen.
   */
  useEffect(() => {
    if (phase !== "setup") return;
    if (recorder.cameraStatus === "ready" || recorder.cameraStatus === "starting") return;
    void startCameraRef.current();
  }, [phase, recorder.cameraStatus]);

  async function retryCamera() {
    setError("");
    const stream = await recorder.startCamera();
    if (!stream) {
      setError(recorder.latestError ?? "카메라와 마이크 권한을 켜 주세요. iOS는 설정 → Safari, 안드로이드는 주소창 자물쇠에서 다시 허용할 수 있어요.");
    }
  }

  async function startWarmup() {
    setError("");
    const started = await recorder.startRecording();
    if (!started) {
      setError(recorder.latestError ?? "녹화를 시작하지 못했습니다.");
      setPhase("error");
      return;
    }

    featureCollector.markRecordingStart();
    featureCollector.markWarmupStart();
    featureCollector.startSampling({
      stream: (recorder.videoRef.current?.srcObject as MediaStream | null) ?? recorder.stream,
      videoElement: recorder.videoRef.current
    });
    setPhase("warmup");
  }

  const finishWarmup = useCallback(() => {
    featureCollector.markWarmupEnd();
    featureCollector.markTargetStart();
    setPhase("target");
  }, [featureCollector]);

  const finishTargetRef = useRef<() => void>(() => undefined);

  async function finishTarget() {
    setError("");
    setIsSubmitting(true);

    try {
      featureCollector.markTargetEnd();
      featureCollector.markRecordingEnd();
      featureCollector.stopSampling();

      const recording = await recorder.stopRecording();
      if (!recording || recording.sizeBytes <= 0) {
        throw new Error("녹화된 영상이 비었습니다. 한 번만 다시 진행해 주세요.");
      }

      const featureResult = featureCollector.buildPayload();
      if (!featureResult.payload) {
        throw new Error(featureResult.error ?? "답변 타이밍을 정리하지 못했습니다.");
      }

      const timings = featureResult.payload.session;
      const uploadUrlResponse = await fetch(`/api/sessions/${session.id}/upload-url`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mimeType: recording.mimeType || "video/webm",
          byteSize: recording.sizeBytes
        })
      });
      const uploadUrlData = (await uploadUrlResponse.json()) as UploadUrlResponse;

      if (!uploadUrlResponse.ok || !uploadUrlData.uploadUrl || !uploadUrlData.r2Key) {
        throw new Error(uploadUrlData.error ?? "영상 업로드 주소를 받지 못했습니다.");
      }

      const uploadResponse = await fetch(uploadUrlData.uploadUrl, {
        method: "PUT",
        headers: uploadUrlData.requiredHeaders ?? { "content-type": recording.mimeType || "video/webm" },
        body: recording.blob
      });

      if (!uploadResponse.ok) {
        throw new Error("영상 업로드가 막혔습니다. Worker 업로드 설정을 확인해야 합니다.");
      }

      const response = await fetch(`/api/sessions/${session.id}/complete-upload`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          r2Key: uploadUrlData.r2Key,
          mimeType: recording.mimeType || "video/webm",
          byteSize: recording.sizeBytes,
          durationMs: timings.durationMs,
          warmupStartMs: timings.warmupStartMs,
          warmupEndMs: timings.warmupEndMs,
          targetStartMs: timings.targetStartMs,
          targetEndMs: timings.targetEndMs,
          featurePayload: featureResult.payload
        })
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "분석 요청을 넘기지 못했습니다.");
      }

      recordingLocalStore.set(session.id, recording.blob, {
        targetStartMs: timings.targetStartMs,
        targetEndMs: timings.targetEndMs
      });
      router.replace(`/result/${session.id}`);
      return;
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "대답을 저장하다가 삐끗했습니다.");
      setPhase("error");
    } finally {
      setIsSubmitting(false);
    }
  }

  const handleAutoFinish = useCallback(() => {
    if (isSubmitting) return;
    void finishTargetRef.current();
  }, [isSubmitting]);

  const handleWarmupComplete = useCallback(() => {
    if (isSubmitting) return;
    finishWarmup();
  }, [finishWarmup, isSubmitting]);

  useEffect(() => {
    finishTargetRef.current = finishTarget;
  });

  async function restart() {
    await recorder.resetRecording();
    featureCollector.reset();
    setError("");
    setRequiresNewSession(false);
    setRefundState("idle");
    setPhase("setup");
  }

  /*
   * Refund one free trial whenever the session lands in an error state.
   * The server-side function is idempotent per session (sessions.refunded_at),
   * so re-fires from retries or stale state don't double-grant.
   */
  useEffect(() => {
    if (phase !== "error") return;
    if (refundState !== "idle") return;

    let cancelled = false;
    setRefundState("pending");
    void fetch(`/api/sessions/${session.id}/refund-trial`, { method: "POST" })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setRefundState("failed");
          return;
        }
        setRefundState("granted");
      })
      .catch(() => {
        if (cancelled) return;
        setRefundState("failed");
      });

    return () => {
      cancelled = true;
    };
  }, [phase, refundState, session.id]);

  useEffect(() => {
    stopCameraRef.current = stopCamera;
  }, [stopCamera]);

  useEffect(() => {
    stopSamplingRef.current = stopSampling;
  }, [stopSampling]);

  useEffect(() => {
    return () => {
      stopSamplingRef.current();
      void stopCameraRef.current();
    };
  }, []);

  return (
    <main className={styles.shell}>
      <section className={styles.stage} data-phase={phase} aria-labelledby="session-title">
        <header className={styles.titleBlock}>
          <span>AI 거짓말탐지기</span>
          <h1 id="session-title">{phase === "setup" ? "이제 상대 차례입니다." : "대답해 주세요."}</h1>
        </header>

        <div className={styles.videoColumn}>
          <div className={styles.videoFrame} data-recording={recorder.isRecording}>
            <video ref={recorder.videoRef} autoPlay muted playsInline />
            {phase === "target" ? (
              <LiveAnalysisHud
                active
                faceBoxRef={featureCollector.liveFaceBoxRef}
                videoElementRef={recorder.videoRef}
              />
            ) : (
              <div className={styles.videoHud}>
                <span>
                  <Camera size={14} aria-hidden />
                  {recorder.cameraStatus === "ready" ? "카메라 OK" : "카메라 대기"}
                </span>
                <span>
                  <Mic size={14} aria-hidden />
                  마이크 체크
                </span>
              </div>
            )}
          </div>

          <div className={styles.checkGrid}>
            <div data-check="face">
              <span className={styles.checkIcon}>
                <Smile size={16} aria-hidden />
              </span>
              <strong>얼굴</strong>
              <span>화면 정중앙에</span>
            </div>
            <div data-check="light">
              <span className={styles.checkIcon}>
                <SunMedium size={16} aria-hidden />
              </span>
              <strong>조명</strong>
              <span>어둡지 않게</span>
            </div>
            <div data-check="voice">
              <span className={styles.checkIcon}>
                <AudioLines size={16} aria-hidden />
              </span>
              <strong>목소리</strong>
              <span>또렷한 발음으로</span>
            </div>
          </div>
        </div>

        <div className={styles.controlColumn}>
          {phase === "setup" ? (
            <div className={styles.panel}>
              <ScanFace size={26} aria-hidden />
              <p>
                {recorder.cameraStatus === "error"
                  ? "카메라/마이크 권한이 막혔어요. 브라우저에서 권한을 다시 켠 뒤 아래 버튼을 눌러 주세요."
                  : recorder.cameraStatus === "ready"
                    ? (
                        <>
                          얼굴을 화면 중앙에 맞춰 주세요.
                          <br />
                          가벼운 질문 5초 뒤 진짜 질문으로 넘어갑니다.
                        </>
                      )
                    : "카메라와 마이크 권한을 허용해 주세요. 허용 즉시 자동으로 켜져요."}
              </p>
              {recorder.cameraStatus === "error" ? (
                <button className={styles.startButton} type="button" onClick={retryCamera}>
                  <RotateCcw size={18} aria-hidden />
                  권한 다시 요청
                </button>
              ) : (
                <button
                  className={styles.startButton}
                  type="button"
                  onClick={startWarmup}
                  disabled={!recorder.isCameraReady}
                >
                  <Play size={18} aria-hidden />
                  {recorder.cameraStatus === "ready" ? "시작하기" : "카메라 켜는 중…"}
                </button>
              )}
            </div>
          ) : null}

          {phase === "warmup" ? (
            <section className={styles.questionPanel} data-kind="warmup">
              <div className={styles.questionHeader}>
                <span className={styles.questionEyebrow}>WARM-UP</span>
                <CountdownRing
                  durationMs={5000}
                  active={!isSubmitting}
                  onComplete={handleWarmupComplete}
                  size="compact"
                />
              </div>
              <h2 className={styles.questionText}>{currentQuestion}</h2>
            </section>
          ) : null}

          {phase === "target" ? (
            <section className={styles.targetPanel}>
              <div className={styles.questionHeader}>
                <span className={styles.questionLabel}>REAL QUESTION</span>
                <CountdownRing
                  durationMs={5000}
                  active={!isSubmitting}
                  onComplete={handleAutoFinish}
                  size="compact"
                />
              </div>
              <h2 className={styles.questionText}>{currentQuestion}</h2>
            </section>
          ) : null}

          {phase !== "error" && error ? <p className={styles.error}>{error}</p> : null}
        </div>
      </section>

      {phase === "target" ? (
        <div className={styles.telemetryWrap}>
          <TelemetryStrip />
        </div>
      ) : null}

      {phase === "error" ? (
        <div className={styles.modalOverlay} role="dialog" aria-modal="true" aria-labelledby="error-modal-title">
          <div className={styles.modalCard}>
            <span className={styles.modalGift} aria-hidden>
              <Gift size={26} />
            </span>
            <h2 id="error-modal-title">죄송합니다.</h2>
            <p className={styles.modalLead}>
              분석 중에 문제가 발생했어요.
              <br />
              사과의 의미로 무료 체험권 1회를 추가로 드릴게요.
            </p>
            <p className={styles.modalDetail}>{error || "잠시 후 다시 시도해 주세요."}</p>
            <p className={styles.modalStatus} data-state={refundState}>
              {refundState === "granted"
                ? "✓ 무료 체험권 1회가 추가됐어요"
                : refundState === "pending"
                  ? "체험권을 추가하는 중…"
                  : refundState === "failed"
                    ? "체험권 추가에 실패했어요. 잠시 후 다시 시도해 주세요."
                    : ""}
            </p>
            <div className={styles.modalActions}>
              <button
                className={styles.startButton}
                type="button"
                onClick={requiresNewSession ? () => router.replace("/new") : restart}
              >
                <RotateCcw size={18} aria-hidden />
                {requiresNewSession ? "새 질문 만들기" : "다시 시도하기"}
              </button>
              {!requiresNewSession ? (
                <button
                  className={styles.secondaryButton}
                  type="button"
                  onClick={() => router.replace("/new")}
                >
                  랜딩으로
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
