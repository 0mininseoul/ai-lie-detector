"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Volume2, VolumeX } from "lucide-react";
import { recordingLocalStore } from "@/lib/recording/local-store";
import { analysisSlowMs } from "@/lib/sessions/analysis-timeout";
import { recordingDownloadUrl } from "@/lib/sessions/video-url";
import { ResultActions } from "./ResultActions";
import type { Headline } from "@/types/domain";
import styles from "./ResultExperience.module.css";

type Status = "pending" | "revealed" | "failed";

type StatusResponse = {
  status: string;
  errorCode?: string | null;
  errorDetail?: string | null;
  recording: null | {
    targetStartMs: number;
    targetEndMs: number;
  };
  result: null | {
    verdict: string;
    headline: Headline;
    roastComment: string;
    public: { share_text?: string } | null;
  };
};

type Props = {
  sessionId: string;
  question: string;
  initialTiming?: {
    targetStartMs: number;
    targetEndMs: number;
  } | null;
};

type PlaybackClip = {
  startSec: number;
  endSec: number;
};

const pollIntervalMs = 1500;

function getFriendlyStatusError(data: Pick<StatusResponse, "status" | "errorCode" | "errorDetail">) {
  if (data.status === "expired") return "세션이 만료되었어요.";
  if (data.errorCode === "analysis_timeout") {
    return "분석 응답이 너무 오래 걸려서 중단했어요.";
  }
  if (data.errorCode === "gemini_region_unsupported") {
    return "현재 지역은 모델 호출이 제한됐어요.";
  }
  if (data.errorDetail?.includes("User location is not supported")) {
    return "현재 지역은 모델 호출이 제한됐어요.";
  }
  if (data.errorDetail?.trim()) return "분석 서버가 응답을 마치지 못했어요.";
  return "분석을 마치지 못했어요.";
}

export function ResultExperience({ sessionId, question, initialTiming = null }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [muted, setMuted] = useState(true);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("pending");
  const [result, setResult] = useState<StatusResponse["result"]>(null);
  const [clip, setClip] = useState<PlaybackClip | null>(() => coercePlaybackClip(initialTiming) ?? null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [isTakingLong, setIsTakingLong] = useState(false);

  useEffect(() => {
    const local = recordingLocalStore.toUrl(sessionId);
    if (local) {
      setVideoSrc(local);
      setClip(coercePlaybackClip(recordingLocalStore.getTiming(sessionId)) ?? null);
      return;
    }
    const remote = recordingDownloadUrl(sessionId);
    setVideoSrc(remote || null);
  }, [sessionId]);

  useEffect(() => {
    const uploadPromise = recordingLocalStore.getUploadPromise(sessionId);
    if (!uploadPromise) return;

    let cancelled = false;
    uploadPromise.catch(() => {
      if (cancelled) return;
      setErrorDetail("영상 업로드가 완료되지 못했어요.");
      setStatus("failed");
    });

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    const startedAt = Date.now();
    let timer: number | undefined;

    const tick = async () => {
      if (cancelled) return true;
      try {
        const response = await fetch(`/api/sessions/${sessionId}/status`, { cache: "no-store" });
        if (!response.ok) return false;
        const data = (await response.json()) as StatusResponse;
        if (cancelled) return true;

        const playbackClip = coercePlaybackClip(data.recording);
        if (playbackClip) {
          setClip(playbackClip);
        }

        if (data.status === "complete" && data.result) {
          setResult(data.result);
          setStatus("revealed");
          setIsTakingLong(false);
          setRevealing(true);
          window.setTimeout(() => setRevealing(false), 1400);
          return true;
        }
        if (data.status === "failed" || data.status === "expired") {
          setErrorDetail(getFriendlyStatusError(data));
          setStatus("failed");
          return true;
        }
        if (Date.now() - startedAt > analysisSlowMs) {
          setIsTakingLong(true);
        }
      } catch {
        // network blip — try again
      }
      return false;
    };

    const loop = async () => {
      const done = await tick();
      if (done || cancelled) return;
      timer = window.setTimeout(loop, pollIntervalMs);
    };
    void loop();

    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [sessionId]);

  const toggleMute = useCallback(() => {
    setMuted((current) => {
      const next = !current;
      if (videoRef.current) videoRef.current.muted = next;
      return next;
    });
  }, []);

  const syncVideoToTargetClip = useCallback(() => {
    const video = videoRef.current;
    if (!video || !clip) return;
    const endSec = video.duration > 0 ? Math.min(clip.endSec, video.duration) : clip.endSec;
    if (endSec <= clip.startSec) return;
    if (video.currentTime < clip.startSec || video.currentTime >= endSec) {
      video.currentTime = clip.startSec;
    }
  }, [clip]);

  const loopTargetClip = useCallback(() => {
    const video = videoRef.current;
    if (!video || !clip) return;
    const endSec = video.duration > 0 ? Math.min(clip.endSec, video.duration) : clip.endSec;
    if (endSec <= clip.startSec) return;
    if (video.currentTime >= endSec - 0.05 || video.ended) {
      video.currentTime = clip.startSec;
      void video.play().catch(() => undefined);
    }
  }, [clip]);

  useEffect(() => {
    syncVideoToTargetClip();
  }, [syncVideoToTargetClip, videoSrc]);

  const headline = result?.headline ?? null;
  const roast = result?.roastComment ?? "";
  const shareText = useMemo(() => {
    if (result?.public?.share_text) return result.public.share_text;
    if (headline) return `질문: ${question} / 판정: ${headline} / ${roast}`;
    return `질문: ${question}`;
  }, [headline, question, result, roast]);

  return (
    <main className={styles.shell}>
      <div className={styles.stage} data-status={status} data-revealing={revealing}>
        {videoSrc ? (
          <video
            ref={videoRef}
            className={styles.video}
            src={videoSrc}
            autoPlay
            muted={muted}
            loop={!clip}
            playsInline
            preload="auto"
            crossOrigin="anonymous"
            onLoadedMetadata={syncVideoToTargetClip}
            onTimeUpdate={loopTargetClip}
            onEnded={loopTargetClip}
          />
        ) : (
          <div className={styles.videoPlaceholder} aria-hidden />
        )}

        <button
          type="button"
          className={styles.muteButton}
          onClick={toggleMute}
          aria-label={muted ? "소리 켜기" : "소리 끄기"}
        >
          {muted ? <VolumeX size={16} aria-hidden /> : <Volume2 size={16} aria-hidden />}
          <span>{muted ? "소리 켜기" : "소리 끄기"}</span>
        </button>

        <header className={styles.topMeta}>
          <span className={styles.brand}>AI 거짓말탐지기</span>
          <p className={styles.question}>{question}</p>
        </header>

        {status === "pending" ? <AnalyzingOverlay isTakingLong={isTakingLong} /> : null}

        {status === "revealed" && headline ? (
          <div className={styles.verdictLayer}>
            <h1 className={styles.headline} data-verdict={headline}>
              {headline}
            </h1>
            {roast ? <p className={styles.roast}>{roast}</p> : null}
          </div>
        ) : null}

        {status === "failed" ? (
          <FailedOverlay
            errorDetail={errorDetail}
            onRetry={() => router.replace("/new")}
            sessionId={sessionId}
          />
        ) : null}

        <ResultActions
          question={question}
          videoSrc={videoSrc}
          headline={headline}
          roastComment={roast}
          shareText={shareText}
          disabled={status !== "revealed"}
        />
      </div>
    </main>
  );
}

function coercePlaybackClip(
  timing: { targetStartMs?: number | null; targetEndMs?: number | null } | null | undefined
): PlaybackClip | undefined {
  const startMs = timing?.targetStartMs;
  const endMs = timing?.targetEndMs;
  if (
    typeof startMs !== "number" ||
    typeof endMs !== "number" ||
    !Number.isFinite(startMs) ||
    !Number.isFinite(endMs) ||
    endMs <= startMs
  ) {
    return undefined;
  }

  return {
    startSec: Math.max(0, startMs / 1000),
    endSec: Math.max(0.1, endMs / 1000)
  };
}

function AnalyzingOverlay({ isTakingLong }: { isTakingLong: boolean }) {
  return (
    <div className={styles.analyzingLayer} aria-live="polite">
      <span className={styles.scanline} aria-hidden />
      <div className={styles.analyzingCard}>
        <span className={styles.analyzingKicker}>ANALYZING</span>
        <div className={styles.bars}>
          <i style={{ animationDelay: "0ms" }} />
          <i style={{ animationDelay: "120ms" }} />
          <i style={{ animationDelay: "240ms" }} />
          <i style={{ animationDelay: "360ms" }} />
          <i style={{ animationDelay: "480ms" }} />
        </div>
        <p className={styles.analyzingLog}>
          {isTakingLong ? "분석이 길어지고 있어요. 결과가 준비되면 바로 표시됩니다." : "표정 · 시선 · 음성 · 지연 패턴 교차 검증"}
        </p>
      </div>
    </div>
  );
}

function FailedOverlay({
  errorDetail,
  onRetry,
  sessionId
}: {
  errorDetail: string | null;
  onRetry: () => void;
  sessionId: string;
}) {
  useEffect(() => {
    void fetch(`/api/sessions/${sessionId}/refund-trial`, { method: "POST" }).catch(() => undefined);
  }, [sessionId]);

  return (
    <div className={styles.failedLayer} role="dialog" aria-modal="true" aria-labelledby="failed-title">
      <div className={styles.failedCard}>
        <h2 id="failed-title">죄송합니다.</h2>
        <p className={styles.failedCopy}>
          <span className={styles.failedCopyLine}>분석 중에 문제가 발생했어요.</span>
          <span className={styles.failedCopyLine}>무료 체험권 1회를 추가로 드릴게요.</span>
        </p>
        {errorDetail ? <p className={styles.failedDetail}>{errorDetail}</p> : null}
        <button type="button" onClick={onRetry}>
          새 질문 만들기
        </button>
      </div>
    </div>
  );
}
