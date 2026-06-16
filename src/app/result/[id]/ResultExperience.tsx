"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
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

type ShareImageUploadUrlResponse = {
  uploadUrl?: string;
  requiredHeaders?: Record<string, string>;
  error?: string;
};

const pollIntervalMs = 1500;
const shareImageWidth = 1080;
const shareImageHeight = 1440;
const shareQuestionMinFontPx = 70;
const shareQuestionMaxFontPx = 118;
const shareQuestionMaxLines = 3;
const shareQuestionSidePadding = 48;

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
  const shareImagePromiseRef = useRef<Promise<boolean> | null>(null);
  const [muted, setMuted] = useState(true);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("pending");
  const [result, setResult] = useState<StatusResponse["result"]>(null);
  const [clip, setClip] = useState<PlaybackClip | null>(() => coercePlaybackClip(initialTiming) ?? null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [isTakingLong, setIsTakingLong] = useState(false);
  const [videoAspect, setVideoAspect] = useState("3 / 4");
  const [videoMaxWidth, setVideoMaxWidth] = useState("75dvh");
  const [shareImageReady, setShareImageReady] = useState(false);
  const [recordingUnavailable, setRecordingUnavailable] = useState(false);

  useEffect(() => {
    const local = recordingLocalStore.toUrl(sessionId);
    if (local) {
      setRecordingUnavailable(false);
      setVideoSrc(local);
      setClip(coercePlaybackClip(recordingLocalStore.getTiming(sessionId)) ?? null);
      return;
    }
    const remote = recordingDownloadUrl(sessionId);
    setRecordingUnavailable(false);
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

  const handleVideoLoadedMetadata = useCallback(() => {
    const video = videoRef.current;
    if (video?.videoWidth && video.videoHeight) {
      setVideoAspect(`${video.videoWidth} / ${video.videoHeight}`);
      setVideoMaxWidth(`${(video.videoWidth / video.videoHeight) * 100}dvh`);
    }
    syncVideoToTargetClip();
  }, [syncVideoToTargetClip]);

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
  const ensureShareImage = useCallback(() => {
    if (!headline) return Promise.resolve(false);
    if (shareImageReady) return Promise.resolve(true);
    if (shareImagePromiseRef.current) return shareImagePromiseRef.current;

    shareImagePromiseRef.current = uploadShareImagePreview({
      sessionId,
      question,
      video: videoRef.current
    })
      .then((uploaded) => {
        setShareImageReady(uploaded);
        if (!uploaded) shareImagePromiseRef.current = null;
        return uploaded;
      })
      .catch(() => {
        setShareImageReady(false);
        shareImagePromiseRef.current = null;
        return false;
      });

    return shareImagePromiseRef.current;
  }, [headline, question, sessionId, shareImageReady]);

  useEffect(() => {
    setShareImageReady(false);
    shareImagePromiseRef.current = null;
    setRecordingUnavailable(false);
  }, [sessionId]);

  useEffect(() => {
    if (headline) {
      void ensureShareImage();
    }
  }, [ensureShareImage, headline]);

  return (
    <main className={styles.shell}>
      <div
        className={styles.stage}
        data-status={status}
        data-revealing={revealing}
        style={{ "--result-aspect": videoAspect, "--result-max-width": videoMaxWidth } as CSSProperties}
      >
        {videoSrc && !recordingUnavailable ? (
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
            onLoadedMetadata={handleVideoLoadedMetadata}
            onTimeUpdate={loopTargetClip}
            onEnded={loopTargetClip}
            onError={() => setRecordingUnavailable(true)}
          />
        ) : (
          <div className={styles.videoPlaceholder} data-unavailable={recordingUnavailable || undefined}>
            {recordingUnavailable ? (
              <p>원본 영상을 찾을 수 없어요. 이전 보관 설정으로 삭제된 영상은 복구할 수 없어요.</p>
            ) : null}
          </div>
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
            {roast ? (
              <p className={styles.roast}>
                {splitRoastLines(roast).map((line, index) => (
                  <span className={styles.roastLine} key={`${line}-${index}`}>
                    {line}
                  </span>
                ))}
              </p>
            ) : null}
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
          sessionId={sessionId}
          question={question}
          videoSrc={recordingUnavailable ? null : videoSrc}
          headline={headline}
          roastComment={roast}
          ensureShareImage={ensureShareImage}
          shareImageReady={shareImageReady}
          disabled={status !== "revealed"}
        />
      </div>
    </main>
  );
}

async function uploadShareImagePreview({
  sessionId,
  question,
  video
}: {
  sessionId: string;
  question: string;
  video: HTMLVideoElement | null;
}) {
  const canvas = document.createElement("canvas");
  canvas.width = shareImageWidth;
  canvas.height = shareImageHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  if (video) {
    await waitForVideoData(video);
  }

  drawShareImage(ctx, video, question);
  const blob = await canvasToJpeg(canvas);
  if (!blob) return false;

  const response = await fetch(`/api/sessions/${sessionId}/share-image-url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mimeType: "image/jpeg",
      byteSize: blob.size
    })
  });
  const data = (await response.json()) as ShareImageUploadUrlResponse;
  if (!response.ok || !data.uploadUrl) {
    throw new Error(data.error ?? "Failed to prepare share image upload");
  }

  const uploadResponse = await fetch(data.uploadUrl, {
    method: "PUT",
    headers: data.requiredHeaders ?? { "content-type": "image/jpeg" },
    body: blob
  });
  if (!uploadResponse.ok) {
    throw new Error("Failed to upload share image");
  }

  return true;
}

function waitForVideoData(video: HTMLVideoElement) {
  if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();

  return new Promise<void>((resolve) => {
    const timeout = window.setTimeout(done, 2500);
    function done() {
      window.clearTimeout(timeout);
      video.removeEventListener("loadeddata", done);
      video.removeEventListener("error", done);
      resolve();
    }
    video.addEventListener("loadeddata", done, { once: true });
    video.addEventListener("error", done, { once: true });
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", 0.9);
  });
}

function drawShareImage(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement | null,
  question: string
) {
  ctx.fillStyle = "#02070a";
  ctx.fillRect(0, 0, shareImageWidth, shareImageHeight);
  if (video?.videoWidth && video.videoHeight) {
    drawCoverVideoMirrored(ctx, video, shareImageWidth, shareImageHeight);
  } else {
    drawFallbackShareImageBackground(ctx);
  }

  const gradient = ctx.createLinearGradient(0, 0, 0, shareImageHeight);
  gradient.addColorStop(0, "rgba(0, 0, 0, 0.08)");
  gradient.addColorStop(0.48, "rgba(0, 0, 0, 0.02)");
  gradient.addColorStop(0.72, "rgba(0, 0, 0, 0.28)");
  gradient.addColorStop(1, "rgba(0, 0, 0, 0.82)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, shareImageWidth, shareImageHeight);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0, 0, 0, 0.82)";
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 5;
  ctx.fillStyle = "#f7faf8";
  drawShareQuestion(ctx, question);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

function drawShareQuestion(ctx: CanvasRenderingContext2D, question: string) {
  const text = normalizeCanvasText(question);
  const maxW = shareImageWidth - shareQuestionSidePadding * 2;
  const linesAtMinimum = layoutQuestionLines(ctx, text, shareQuestionMinFontPx, maxW, shareQuestionMaxLines);
  const targetLineCount = linesAtMinimum.fits
    ? linesAtMinimum.lines.length
    : shareQuestionMaxLines;

  let fontSize = shareQuestionMinFontPx;
  let lines = linesAtMinimum.lines;

  for (let candidate = shareQuestionMaxFontPx; candidate >= shareQuestionMinFontPx; candidate -= 2) {
    const layout = layoutQuestionLines(ctx, text, candidate, maxW, targetLineCount);
    if (layout.fits) {
      fontSize = candidate;
      lines = layout.lines;
      break;
    }
  }

  if (fontSize === shareQuestionMinFontPx && !linesAtMinimum.fits) {
    lines = layoutQuestionLines(ctx, text, shareQuestionMinFontPx, maxW, shareQuestionMaxLines, true).lines;
  }

  const lineHeight = Math.round(fontSize * 1.14);
  const blockCenterY = 1170;
  const firstBaselineY = blockCenterY - ((lines.length - 1) * lineHeight) / 2;

  ctx.font = canvasQuestionFont(fontSize);
  ctx.textAlign = "center";
  lines.forEach((line, index) => {
    ctx.fillText(line, shareImageWidth / 2, firstBaselineY + index * lineHeight);
  });
}

function drawFallbackShareImageBackground(ctx: CanvasRenderingContext2D) {
  const base = ctx.createLinearGradient(0, 0, shareImageWidth, shareImageHeight);
  base.addColorStop(0, "#04130c");
  base.addColorStop(0.48, "#071018");
  base.addColorStop(1, "#020408");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, shareImageWidth, shareImageHeight);

  const glow = ctx.createRadialGradient(540, 420, 0, 540, 420, 680);
  glow.addColorStop(0, "rgba(142, 240, 191, 0.22)");
  glow.addColorStop(0.42, "rgba(52, 92, 126, 0.16)");
  glow.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, shareImageWidth, shareImageHeight);
}

function drawCoverVideoMirrored(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number
) {
  const vw = video.videoWidth || width;
  const vh = video.videoHeight || height;
  const scale = Math.max(width / vw, height / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (width - dw) / 2;
  const dy = (height - dh) / 2;
  ctx.save();
  ctx.translate(width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, dx, dy, dw, dh);
  ctx.restore();
}

function normalizeCanvasText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function canvasQuestionFont(fontSize: number) {
  return `900 ${fontSize}px Paperlogy, system-ui, sans-serif`;
}

function layoutQuestionLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  maxW: number,
  maxLines: number,
  truncate = false
) {
  ctx.font = canvasQuestionFont(fontSize);
  const units = Array.from(text);
  const lines: string[] = [];
  let current = "";
  let index = 0;

  while (index < units.length) {
    const next = `${current}${units[index]}`;
    if (current && ctx.measureText(next.trim()).width > maxW) {
      lines.push(current.trimEnd());
      current = "";
      if (lines.length === maxLines) {
        return {
          lines: truncate ? ellipsizeLastLine(ctx, lines, maxW) : lines,
          fits: false
        };
      }
      continue;
    }

    current = next;
    index += 1;
  }

  if (current) lines.push(current.trimEnd());
  const fits = lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxW);
  return {
    lines: fits || !truncate ? lines.slice(0, maxLines) : ellipsizeLastLine(ctx, lines.slice(0, maxLines), maxW),
    fits
  };
}

function ellipsizeLastLine(ctx: CanvasRenderingContext2D, lines: string[], maxW: number) {
  if (lines.length === 0) return lines;
  const next = [...lines];
  let last = next[next.length - 1] ?? "";
  while (last.length > 0 && ctx.measureText(`${last}…`).width > maxW) {
    last = last.slice(0, -1);
  }
  next[next.length - 1] = `${last}…`;
  return next;
}

function splitRoastLines(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const lines: string[] = [];
  let current = "";
  const chars = Array.from(normalized);

  chars.forEach((char, index) => {
    current += char;
    const next = chars[index + 1] ?? "";
    const previous = chars[index - 1] ?? "";
    const isSinglePeriod = char === "." && previous !== "." && next !== ".";
    const isSentenceEnd = char === "?" || char === "!" || char === "。" || isSinglePeriod;
    if (!isSentenceEnd) return;
    if (next && !/\s/.test(next)) return;

    const line = current.trim();
    if (line) lines.push(line);
    current = "";
  });

  const tail = current.trim();
  if (tail) lines.push(tail);
  return lines.length > 0 ? lines : [normalized];
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
          {isTakingLong ? (
            <>
              <span className={styles.analyzingLogLine}>분석이 길어지고 있어요.</span>
              <span className={styles.analyzingLogLine}>결과가 준비되면 바로 표시됩니다.</span>
            </>
          ) : (
            "표정 · 시선 · 음성 · 지연 패턴 교차 검증"
          )}
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
