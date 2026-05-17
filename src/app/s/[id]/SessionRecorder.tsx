"use client";

import { Camera, Check, CircleStop, Mic, Play, RotateCcw, ScanFace } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ProfessionalOverlay } from "@/components/analysis/ProfessionalOverlay";
import { useCameraRecorder } from "@/hooks/useCameraRecorder";
import { useFeatureCollector } from "@/hooks/useFeatureCollector";
import styles from "./session.module.css";

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
  if (status === "failed") return "분석이 실패했어. 이 판은 다시 해야 돼.";
  if (status === "expired") return "이 판은 시간이 지나서 만료됐어.";
  return "";
}

export function SessionRecorder({ session }: SessionRecorderProps) {
  const router = useRouter();
  const recorder = useCameraRecorder();
  const featureCollector = useFeatureCollector();
  const { stopCamera } = recorder;
  const stopCameraRef = useRef(stopCamera);
  const [phase, setPhase] = useState<FlowPhase>(() => getInitialPhase(session.status));
  const [error, setError] = useState(() => getInitialError(session.status));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [requiresNewSession, setRequiresNewSession] = useState(() => ["failed", "expired"].includes(session.status));

  const currentQuestion = useMemo(() => {
    if (phase === "warmup") return session.warmupQuestion;
    if (phase === "target") return session.targetQuestion;
    return "";
  }, [phase, session.targetQuestion, session.warmupQuestion]);

  async function prepareCamera() {
    setError("");
    const stream = await recorder.startCamera();
    if (!stream) {
      setError(recorder.latestError ?? "카메라랑 마이크가 안 잡혔어. 권한을 다시 확인해줘.");
    }
  }

  async function startWarmup() {
    setError("");
    const started = await recorder.startRecording();
    if (!started) {
      setError(recorder.latestError ?? "녹화를 시작하지 못했어.");
      setPhase("error");
      return;
    }

    featureCollector.markRecordingStart();
    featureCollector.markWarmupStart();
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

      const recording = await recorder.stopRecording();
      if (!recording || recording.sizeBytes <= 0) {
        throw new Error("녹화된 영상이 비었어. 한 번만 다시 해보자.");
      }

      const featureResult = featureCollector.buildPayload();
      if (!featureResult.payload) {
        throw new Error(featureResult.error ?? "답변 타이밍을 정리하지 못했어.");
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
        throw new Error(uploadUrlData.error ?? "영상 업로드 주소를 못 받았어.");
      }

      const uploadResponse = await fetch(uploadUrlData.uploadUrl, {
        method: "PUT",
        headers: uploadUrlData.requiredHeaders ?? { "content-type": recording.mimeType || "video/webm" },
        body: recording.blob
      });

      if (!uploadResponse.ok) {
        throw new Error("영상 업로드가 막혔어. R2 CORS랑 업로드 키를 확인해야 돼.");
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
        throw new Error(data.error ?? "분석 요청을 넘기지 못했어.");
      }

      setPhase("analyzing");
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "대답 저장하다가 삐끗했어.");
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
    setPhase("setup");
  }

  useEffect(() => {
    if (phase !== "analyzing") return;

    let cancelled = false;
    let failures = 0;
    const startedAt = Date.now();
    const interval = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/sessions/${session.id}/status`, { cache: "no-store" });
        const data = (await response.json()) as { status?: string; result?: unknown };

        if (!response.ok) {
          failures += 1;
          if (!cancelled && failures >= 5) {
            setError("분석 상태 확인이 계속 실패했어. 잠깐 후 다시 들어와줘.");
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
          setError(data.status === "failed" ? "분석이 실패했어. 이 판은 다시 해야 돼." : "이 판은 시간이 지나서 만료됐어.");
          setRequiresNewSession(true);
          setPhase("error");
          return;
        }

        if (!cancelled && Date.now() - startedAt > 180_000) {
          setError("분석이 너무 오래 걸리고 있어. 결과 화면을 새로 열어보고, 계속 안 뜨면 다시 해줘.");
          setRequiresNewSession(true);
          setPhase("error");
        }
      } catch {
        failures += 1;
        if (!cancelled && failures >= 5) {
          setError("분석 상태 확인이 계속 실패했어. 잠깐 후 다시 들어와줘.");
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
    return () => {
      void stopCameraRef.current();
    };
  }, []);

  return (
    <main className={styles.shell}>
      <section className={styles.stage} aria-labelledby="session-title">
        <div className={styles.videoColumn}>
          <div className={styles.videoFrame} data-recording={recorder.isRecording}>
            <video ref={recorder.videoRef} autoPlay muted playsInline />
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
          </div>

          <div className={styles.checkGrid}>
            <div>
              <strong>얼굴</strong>
              <span>화면 중앙에 맞춰줘</span>
            </div>
            <div>
              <strong>조명</strong>
              <span>너무 어둡지만 않으면 돼</span>
            </div>
            <div>
              <strong>목소리</strong>
              <span>대답은 또렷하게 해줘</span>
            </div>
          </div>
        </div>

        <div className={styles.controlColumn}>
          <div className={styles.titleBlock}>
            <span>AI 거짓말탐지기</span>
            <h1 id="session-title">{phase === "setup" ? "이제 상대 차례야." : "대답해봐."}</h1>
          </div>

          {phase === "setup" ? (
            <div className={styles.panel}>
              <ScanFace size={28} aria-hidden />
              <p>카메라랑 마이크 허용하고 얼굴을 화면에 맞춰줘. 준비됐으면 가볍게 하나 물어보고 진짜 질문으로 들어갈게.</p>
              <button className={styles.primaryButton} type="button" onClick={prepareCamera}>
                카메라/마이크 확인하기
              </button>
              <button className={styles.startButton} type="button" onClick={startWarmup} disabled={!recorder.isCameraReady}>
                <Play size={18} aria-hidden />
                시작하기
              </button>
            </div>
          ) : null}

          {phase === "warmup" || phase === "target" ? (
            <div className={styles.questionPanel}>
              <span>{phase === "target" ? "이제 진짜 질문이야." : "먼저 가볍게 하나만."}</span>
              <h2>{currentQuestion}</h2>
              <button className={styles.stopButton} type="button" onClick={phase === "warmup" ? finishWarmup : finishTarget} disabled={isSubmitting}>
                <CircleStop size={18} aria-hidden />
                {phase === "warmup" ? "대답 끝났어" : "판정하러 가기"}
              </button>
            </div>
          ) : null}

          {phase === "between" ? (
            <div className={styles.panel}>
              <Check size={28} aria-hidden />
              <p>몸풀기는 끝났어. 이제 진짜 질문 간다. 표정 관리할 거면 지금부터가 본게임이야.</p>
              <button className={styles.startButton} type="button" onClick={startTarget}>
                <Play size={18} aria-hidden />
                진짜 질문 보기
              </button>
            </div>
          ) : null}

          {phase === "analyzing" ? <ProfessionalOverlay /> : null}

          {phase === "error" ? (
            <div className={styles.panel}>
              <p>{error || "진행 중 문제가 생겼어. 다시 한 번 가자."}</p>
              <button
                className={styles.secondaryButton}
                type="button"
                onClick={requiresNewSession ? () => router.replace("/") : restart}
              >
                <RotateCcw size={18} aria-hidden />
                {requiresNewSession ? "새 질문 만들기" : "다시 하기"}
              </button>
            </div>
          ) : null}

          {phase !== "error" && error ? <p className={styles.error}>{error}</p> : null}
        </div>
      </section>
    </main>
  );
}
