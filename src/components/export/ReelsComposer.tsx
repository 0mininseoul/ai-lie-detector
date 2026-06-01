"use client";

import { Download, Film, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pickSupportedMimeType } from "@/lib/recording/mime";
import type { Headline } from "@/types/domain";
import styles from "./ReelsComposer.module.css";

type Props = {
  videoSrc: string;
  question: string;
  headline: Headline;
  roastComment: string;
};

const CANVAS_W = 1080;
const CANVAS_H = 1920;
const REVEAL_HOLD_MS = 1800;

type VideoWithCapture = HTMLVideoElement & {
  captureStream?: () => MediaStream;
  mozCaptureStream?: () => MediaStream;
};

function captureFromVideo(video: VideoWithCapture): MediaStream | null {
  if (typeof video.captureStream === "function") return video.captureStream();
  if (typeof video.mozCaptureStream === "function") return video.mozCaptureStream();
  return null;
}

export function ReelsComposer({ videoSrc, question, headline, roastComment }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [status, setStatus] = useState<"idle" | "rendering" | "ready" | "error">("idle");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [downloadName, setDownloadName] = useState("ai-lie-detector-reels.mp4");
  const urlRef = useRef("");

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, []);

  async function start() {
    if (status === "rendering") return;
    const canvas = canvasRef.current;
    const video = videoRef.current as VideoWithCapture | null;
    if (!canvas || !video) return;
    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;
    const ctx: CanvasRenderingContext2D = ctx2d;

    const stream = captureFromVideo(video);
    if (!stream) {
      // Fallback: trigger download of the raw source video.
      const a = document.createElement("a");
      a.href = videoSrc;
      a.download = "ai-lie-detector-recording.mp4";
      a.target = "_blank";
      a.rel = "noopener";
      a.click();
      return;
    }

    setStatus("rendering");
    setDownloadUrl("");
    setDownloadName("ai-lie-detector-reels.mp4");
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = "";

    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;

    video.muted = false;
    video.currentTime = 0;
    try {
      await video.play();
    } catch {
      // play() may reject if metadata isn't ready; we still try to draw frames.
    }

    const canvasStream = canvas.captureStream(30);
    stream.getAudioTracks().forEach((track) => canvasStream.addTrack(track));

    const mimeType = pickSupportedMimeType((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
    const recorder = new MediaRecorder(canvasStream, { mimeType });
    const chunks: BlobPart[] = [];

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };
    recorder.onerror = () => {
      setStatus("error");
      video.pause();
      canvasStream.getTracks().forEach((track) => track.stop());
    };
    recorder.onstop = () => {
      canvasStream.getTracks().forEach((track) => track.stop());
      const recordedMimeType = recorder.mimeType || mimeType || "video/mp4";
      const blob = new Blob(chunks, { type: recordedMimeType });
      const extension = recordedMimeType.includes("mp4") ? "mp4" : "webm";
      const next = URL.createObjectURL(blob);
      urlRef.current = next;
      setDownloadUrl(next);
      setDownloadName(`ai-lie-detector-reels.${extension}`);
      setStatus("ready");
    };
    recorder.start(200);

    const startedAt = performance.now();
    const videoDurationMs = Math.max((video.duration || 5) * 1000, 4000);
    const totalMs = videoDurationMs + REVEAL_HOLD_MS;

    const liveVideo = video;
    function frame(now: number) {
      const elapsed = now - startedAt;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
      drawCoverVideo(ctx, liveVideo);
      drawTopChrome(ctx, question);
      if (elapsed > videoDurationMs) {
        const revealProgress = Math.min(1, (elapsed - videoDurationMs) / 800);
        drawVerdict(ctx, headline, roastComment, revealProgress);
      }
      if (elapsed < totalMs) {
        requestAnimationFrame(frame);
      } else {
        if (recorder.state !== "inactive") recorder.stop();
        liveVideo.pause();
      }
    }
    requestAnimationFrame(frame);
  }

  return (
    <div className={styles.composer}>
      <canvas ref={canvasRef} aria-hidden className={styles.canvas} />
      <video
        ref={videoRef}
        src={videoSrc}
        playsInline
        crossOrigin="anonymous"
        className={styles.hiddenVideo}
        preload="auto"
        aria-hidden
      />
      {downloadUrl ? (
        <a href={downloadUrl} download={downloadName} className={styles.button}>
          <Download size={16} aria-hidden /> 영상 저장
        </a>
      ) : (
        <button type="button" onClick={start} disabled={status === "rendering"} className={styles.button}>
          {status === "rendering" ? (
            <Loader2 size={16} aria-hidden className={styles.spin} />
          ) : (
            <Film size={16} aria-hidden />
          )}
          {status === "rendering" ? "영상 만드는 중" : "릴스 영상"}
        </button>
      )}
    </div>
  );
}

function drawCoverVideo(ctx: CanvasRenderingContext2D, video: HTMLVideoElement) {
  const vw = video.videoWidth || CANVAS_W;
  const vh = video.videoHeight || CANVAS_H;
  const scale = Math.max(CANVAS_W / vw, CANVAS_H / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  const dx = (CANVAS_W - dw) / 2;
  const dy = (CANVAS_H - dh) / 2;
  ctx.save();
  ctx.translate(CANVAS_W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, dx, dy, dw, dh);
  ctx.restore();
}

function drawTopChrome(ctx: CanvasRenderingContext2D, question: string) {
  ctx.fillStyle = "rgba(7, 11, 16, 0.55)";
  ctx.fillRect(0, 0, CANVAS_W, 220);
  ctx.fillStyle = "#9af2c8";
  ctx.font = "700 26px Pretendard, system-ui, sans-serif";
  ctx.textAlign = "left";
  ctx.fillText("AI 거짓말탐지기", 64, 80);
  ctx.fillStyle = "rgba(7, 11, 16, 0.72)";
  ctx.fillRect(48, 110, CANVAS_W - 96, 96);
  ctx.fillStyle = "#f4f7fb";
  ctx.font = "800 34px Pretendard, system-ui, sans-serif";
  wrap(ctx, question, 72, 158, CANVAS_W - 144, 44, 2);
}

function drawVerdict(ctx: CanvasRenderingContext2D, headline: Headline, roast: string, t: number) {
  const eased = 1 - Math.pow(1 - t, 3);
  ctx.save();
  ctx.globalAlpha = eased;
  ctx.fillStyle = "rgba(7, 11, 16, 0.6)";
  ctx.fillRect(0, CANVAS_H * 0.32, CANVAS_W, CANVAS_H * 0.5);
  ctx.font = "900 280px Pretendard, system-ui, sans-serif";
  ctx.fillStyle = headline === "거짓" ? "#ff6b48" : "#72e3ad";
  ctx.textAlign = "center";
  ctx.fillText(headline, CANVAS_W / 2, CANVAS_H * 0.58);
  ctx.textAlign = "left";
  ctx.font = "700 40px Pretendard, system-ui, sans-serif";
  ctx.fillStyle = "#f4f7fb";
  wrap(ctx, roast, 80, CANVAS_H * 0.78, CANVAS_W - 160, 54, 3);
  ctx.font = "600 24px Pretendard, system-ui, sans-serif";
  ctx.fillStyle = "rgba(244, 247, 251, 0.62)";
  ctx.fillText("nogoora.vercel.app", 80, CANVAS_H - 80);
  ctx.restore();
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number,
  maxLines: number
) {
  const chars = Array.from(text);
  let line = "";
  const lines: string[] = [];
  for (const ch of chars) {
    const candidate = line + ch;
    if (ctx.measureText(candidate).width > maxW) {
      if (line) lines.push(line);
      line = ch;
      if (lines.length === maxLines - 1) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  lines.forEach((ln, i) => ctx.fillText(ln, x, y + i * lineH));
}
