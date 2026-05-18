"use client";

import { Camera, Check, CircleStop, Gift, Mic, Play, RotateCcw, ScanFace } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { LiveAnalysisHud } from "@/components/analysis/LiveAnalysisHud";
import { ProfessionalOverlay } from "@/components/analysis/ProfessionalOverlay";
import { useCameraRecorder } from "@/hooks/useCameraRecorder";
import { useFeatureCollector } from "@/hooks/useFeatureCollector";
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

type FlowPhase = "setup" | "warmup" | "between" | "target" | "analyzing" | "complete" | "error";

type UploadUrlResponse = {
  uploadUrl?: string;
  r2Key?: string;
  requiredHeaders?: Record<string, string>;
  error?: string;
};

function getInitialPhase(status: string): FlowPhase {
  if (status === "uploaded" || status === "analyzing") return "analyzing";
  if (status === "complete") return "complete";
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

  async function prepareCamera() {
    setError("");
    const stream = await recorder.startCamera();
    if (!stream) {
      setError(recorder.latestError ?? "카메라와 마이크가 잡히지 않았습니다. 권한을 다시 확인해 주세요.");
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

  function finishWarmup() {
    featureCollector.markWarmupEnd();
    setPhase("between");
  }

  function startTarget() {
    featureCollector.markTargetStart();
    setPhase("target");
  }

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

      setPhase("analyzing");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "대답을 저장하다가 삐끗했습니다.");
      setPhase("error");
    } finally {
      setIsSubmitting(false);
    }
  }

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
    if (phase !== "analyzing") return;

    let cancelled = false;
    let failures = 0;
    const startedAt = Date.now();

    void fetch(`/api/sessions/${session.id}/analyze`, { method: "POST" }).catch(() => undefined);

    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/sessions/${session.id}/status`, { cache: "no-store" });
        const data = (await response.json()) as {
          status?: string;
          result?: unknown;
          errorCode?: string | null;
          errorDetail?: string | null;
        };

        if (!response.ok) {
          failures += 1;
          if (!cancelled && failures >= 5) {
            setError("분석 상태 확인이 계속 실패했습니다. 잠깐 후 다시 들어와 주세요.");
            setRequiresNewSession(true);
            setPhase("error");
          }
          return;
        }

        failures = 0;

        if (!cancelled && response.ok && data.status === "complete" && data.result) {
          setPhase("complete");
          router.push(`/result/${session.id}`);
          return;
        }

        if (!cancelled && (data.status === "failed" || data.status === "expired")) {
          const detail = data.errorDetail ? ` (${data.errorCode ?? "error"}: ${data.errorDetail})` : "";
          setError(
            data.status === "failed"
              ? `분석이 실패했습니다.${detail} 이번 판은 다시 진행해 주세요.`
              : "이번 판은 시간이 지나 만료되었습니다."
          );
          setRequiresNewSession(true);
          setPhase("error");
          return;
        }

        if (!cancelled && Date.now() - startedAt > 180_000) {
          setError("분석이 너무 오래 걸리고 있습니다. 결과 화면을 새로 열어 보고, 계속 안 뜨면 다시 진행해 주세요.");
          setRequiresNewSession(true);
          setPhase("error");
        }
      } catch {
        failures += 1;
        if (!cancelled && failures >= 5) {
          setError("분석 상태 확인이 계속 실패했습니다. 잠깐 후 다시 들어와 주세요.");
          setRequiresNewSession(true);
          setPhase("error");
        }
      }
    }, 2200);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [phase, router, session.id]);

  useEffect(() => {
    if (phase === "complete") {
      router.replace(`/result/${session.id}`);
    }
  }, [phase, router, session.id]);

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
      <section className={styles.stage} aria-labelledby="session-title">
        <div className={styles.videoColumn}>
          <div className={styles.videoFrame} data-recording={recorder.isRecording}>
            <video ref={recorder.videoRef} autoPlay muted playsInline />
            {phase === "target" || phase === "analyzing" ? (
              <LiveAnalysisHud active={phase === "target"} />
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
            <div>
              <strong>얼굴</strong>
              <span>화면 중앙에 맞춰 주세요</span>
            </div>
            <div>
              <strong>조명</strong>
              <span>너무 어둡지만 않으면 괜찮습니다</span>
            </div>
            <div>
              <strong>목소리</strong>
              <span>대답은 또렷하게 해 주세요</span>
            </div>
          </div>
        </div>

        <div className={styles.controlColumn}>
          <div className={styles.titleBlock}>
            <span>AI 거짓말탐지기</span>
            <h1 id="session-title">{phase === "setup" ? "이제 상대 차례입니다." : "대답해 주세요."}</h1>
          </div>

          {phase === "setup" ? (
            <div className={styles.panel}>
              <ScanFace size={28} aria-hidden />
              <p>카메라와 마이크를 허용하고 얼굴을 화면에 맞춰 주세요. 준비되면 가볍게 하나 물어보고 진짜 질문으로 들어갑니다.</p>
              <button className={styles.primaryButton} type="button" onClick={prepareCamera}>
                카메라/마이크 확인하기
              </button>
              <button className={styles.startButton} type="button" onClick={startWarmup} disabled={!recorder.isCameraReady}>
                <Play size={18} aria-hidden />
                시작하기
              </button>
            </div>
          ) : null}

          {phase === "warmup" ? (
            <div className={styles.questionPanel}>
              <span>먼저 가볍게 하나만 답해 주세요.</span>
              <h2>{currentQuestion}</h2>
              <button
                className={styles.stopButton}
                type="button"
                onClick={finishWarmup}
                disabled={isSubmitting}
              >
                <CircleStop size={18} aria-hidden />
                대답 완료
              </button>
            </div>
          ) : null}

          {phase === "target" ? (
            <>
              <div className={styles.questionBar}>
                <span>진짜 질문</span>
                <h2>{currentQuestion}</h2>
              </div>
              <ProfessionalOverlay />
              <button
                className={styles.stopButton}
                type="button"
                onClick={finishTarget}
                disabled={isSubmitting}
              >
                <CircleStop size={18} aria-hidden />
                답변 끝내기
              </button>
            </>
          ) : null}

          {phase === "between" ? (
            <div className={styles.panel}>
              <Check size={28} aria-hidden />
              <p>몸풀기는 끝났습니다. 이제 진짜 질문입니다. 표정 관리하실 거면 지금부터가 본게임입니다.</p>
              <button className={styles.startButton} type="button" onClick={startTarget}>
                <Play size={18} aria-hidden />
                진짜 질문 보기
              </button>
            </div>
          ) : null}

          {phase === "analyzing" ? <ProfessionalOverlay /> : null}

          {phase !== "error" && error ? <p className={styles.error}>{error}</p> : null}
        </div>
      </section>

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
