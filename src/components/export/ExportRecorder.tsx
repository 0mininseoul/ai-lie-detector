"use client";

import { Download, Film, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { pickSupportedMimeType } from "@/lib/recording/mime";
import type { Headline } from "@/types/domain";
import styles from "./ExportRecorder.module.css";

type ExportRecorderProps = {
  question: string;
  headline: Headline;
  roastComment: string;
};

const exportDurationMs = 6200;
const exportWidth = 1080;
const exportHeight = 1920;

export function ExportRecorder({ question, headline, roastComment }: ExportRecorderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const renderTokenRef = useRef(0);
  const isMountedRef = useRef(false);
  const urlRef = useRef("");
  const [downloadUrl, setDownloadUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "rendering" | "ready" | "error">("idle");

  async function renderExport() {
    if (status === "rendering") return;

    const canvas = canvasRef.current;
    if (!canvas || typeof MediaRecorder === "undefined") {
      setStatus("error");
      return;
    }

    const canvasContext = canvas.getContext("2d");
    if (!canvasContext) {
      setStatus("error");
      return;
    }
    const drawingContext: CanvasRenderingContext2D = canvasContext;

    const renderToken = renderTokenRef.current + 1;
    renderTokenRef.current = renderToken;
    let stream: MediaStream | null = null;
    let recorder: MediaRecorder | null = null;
    let didFail = false;

    try {
      revokeCurrentUrl();
      setStatus("rendering");
      setDownloadUrl("");

      canvas.width = exportWidth;
      canvas.height = exportHeight;

      stream = canvas.captureStream(30);
      streamRef.current = stream;
      const mimeType = pickSupportedMimeType((type) => MediaRecorder.isTypeSupported(type));
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorderRef.current = recorder;
      const chunks: BlobPart[] = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onerror = () => {
        didFail = true;
        cleanupActiveRender();
        if (isCurrentRender(renderToken)) {
          setStatus("error");
        }
      };

      recorder.onstop = () => {
        stopCanvasStream(stream);
        if (recorderRef.current === recorder) recorderRef.current = null;
        if (streamRef.current === stream) streamRef.current = null;

        if (didFail || !isCurrentRender(renderToken)) {
          return;
        }

        const blob = new Blob(chunks, { type: recorder?.mimeType || "video/webm" });
        const nextUrl = URL.createObjectURL(blob);
        urlRef.current = nextUrl;
        setDownloadUrl(nextUrl);
        setStatus("ready");
      };

      recorder.start(250);
      const startedAt = performance.now();

      await new Promise<void>((resolve) => {
        function drawFrame(now: number) {
          if (!isCurrentRender(renderToken)) {
            resolve();
            return;
          }

          const progress = Math.min(1, (now - startedAt) / exportDurationMs);
          drawExportFrame(drawingContext, {
            question,
            headline,
            roastComment,
            progress
          });

          if (progress < 1) {
            animationFrameRef.current = requestAnimationFrame(drawFrame);
            return;
          }

          resolve();
        }

        animationFrameRef.current = requestAnimationFrame(drawFrame);
      });

      if (isCurrentRender(renderToken) && recorder.state !== "inactive") {
        recorder.stop();
      }
    } catch {
      didFail = true;
      cleanupActiveRender();
      if (isCurrentRender(renderToken)) {
        setStatus("error");
      }
    }
  }

  function revokeCurrentUrl() {
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = "";
    }
  }

  function isCurrentRender(renderToken: number) {
    return isMountedRef.current && renderTokenRef.current === renderToken;
  }

  function cleanupActiveRender() {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      recorderRef.current = null;
    }

    stopCanvasStream(streamRef.current);
    streamRef.current = null;
  }

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      renderTokenRef.current += 1;
      cleanupActiveRender();
      revokeCurrentUrl();
    };
  }, []);

  return (
    <div className={styles.exporter}>
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden />
      <button type="button" onClick={renderExport} disabled={status === "rendering"}>
        {status === "rendering" ? <Loader2 size={18} aria-hidden className={styles.spin} /> : <Film size={18} aria-hidden />}
        {status === "rendering" ? "영상 만드는 중" : "릴스용 영상 만들기"}
      </button>
      {downloadUrl ? (
        <a href={downloadUrl} download="ai-lie-detector-result.webm">
          <Download size={18} aria-hidden />
          영상 저장
        </a>
      ) : null}
      {status === "error" ? <p>브라우저가 영상 만들기를 거부했습니다. Chrome이나 Safari 최신 버전으로 다시 시도해 주세요.</p> : null}
    </div>
  );
}

function drawExportFrame(
  context: CanvasRenderingContext2D,
  input: {
    question: string;
    headline: Headline;
    roastComment: string;
    progress: number;
  }
) {
  const { canvas } = context;
  const verdictColor = input.headline === "거짓" ? "#ca3214" : "#10b981";
  const eased = easeOutCubic(input.progress);

  context.fillStyle = "#fbfdfb";
  context.fillRect(0, 0, canvas.width, canvas.height);

  drawGrid(context, eased);
  drawGlassPlates(context, verdictColor, eased);

  context.fillStyle = "#171717";
  context.font = "900 58px Pretendard, system-ui, sans-serif";
  context.fillText("AI 거짓말탐지기", 72, 128);

  context.fillStyle = "rgba(32, 32, 32, 0.62)";
  context.font = "800 28px Pretendard, system-ui, sans-serif";
  context.fillText("커플 전용 판정 결과", 72, 176);

  drawQuestionBox(context, input.question);

  context.save();
  context.globalAlpha = Math.min(1, eased * 1.25);
  context.fillStyle = verdictColor;
  context.font = "900 186px Pretendard, system-ui, sans-serif";
  context.fillText(input.headline, 72, 1188);
  context.restore();

  context.fillStyle = "#171717";
  context.font = "900 48px Pretendard, system-ui, sans-serif";
  wrapCanvasText(context, input.roastComment, 72, 1298, 920, 62, 3);

  context.fillStyle = "rgba(114, 227, 173, 0.38)";
  context.fillRect(72, 1640, 936, 2);
  context.fillStyle = "rgba(32, 32, 32, 0.72)";
  context.font = "800 34px Pretendard, system-ui, sans-serif";
  context.fillText("질문 공개. 판정 공개.", 72, 1718);
  context.fillText("ai-lie-detector.vercel.app", 72, 1774);
}

function drawGrid(context: CanvasRenderingContext2D, progress: number) {
  context.strokeStyle = `rgba(59, 130, 246, ${0.1 + progress * 0.07})`;
  context.lineWidth = 1;

  for (let x = 0; x <= exportWidth; x += 72) {
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, exportHeight);
    context.stroke();
  }

  for (let y = 0; y <= exportHeight; y += 72) {
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(exportWidth, y);
    context.stroke();
  }
}

function drawGlassPlates(context: CanvasRenderingContext2D, color: string, progress: number) {
  const baseX = 72;
  const width = 936;
  const plateY = 430;

  context.fillStyle = "rgba(255, 255, 255, 0.62)";
  context.fillRect(baseX, plateY, width, 310);
  context.fillStyle = "rgba(255, 255, 255, 0.36)";
  context.fillRect(baseX + 28, plateY + 28, width - 56, 92);
  context.fillRect(baseX + 28, plateY + 146, width - 56, 108);

  context.fillStyle = color;
  context.globalAlpha = 0.18 + progress * 0.24;
  context.fillRect(baseX, plateY, width, 8);
  context.fillRect(baseX, plateY + 302, width, 8);
  context.globalAlpha = 1;
}

function drawQuestionBox(context: CanvasRenderingContext2D, question: string) {
  context.fillStyle = "rgba(255, 255, 255, 0.72)";
  context.fillRect(72, 850, 936, 174);
  context.fillStyle = "#006239";
  context.font = "900 28px Pretendard, system-ui, sans-serif";
  context.fillText("질문", 108, 910);
  context.fillStyle = "#171717";
  context.font = "900 43px Pretendard, system-ui, sans-serif";
  wrapCanvasText(context, question, 108, 970, 860, 54, 2);
}

function wrapCanvasText(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines: number
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth) {
      line = candidate;
      continue;
    }

    if (line) lines.push(line);
    line = word;
    if (lines.length === maxLines - 1) break;
  }

  if (line && lines.length < maxLines) {
    lines.push(line);
  }

  lines.forEach((lineText, index) => {
    const suffix = index === maxLines - 1 && words.join(" ").length > lines.join(" ").length ? "..." : "";
    context.fillText(`${lineText}${suffix}`, x, y + index * lineHeight);
  });
}

function stopCanvasStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

function easeOutCubic(value: number) {
  return 1 - Math.pow(1 - value, 3);
}
