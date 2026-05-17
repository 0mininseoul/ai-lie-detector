"use client";

import { Share2 } from "lucide-react";
import { useState } from "react";
import { ExportRecorder } from "@/components/export/ExportRecorder";
import styles from "./result.module.css";
import type { Headline } from "@/types/domain";

type ResultActionsProps = {
  question: string;
  headline?: Headline;
  roastComment?: string;
  shareText?: string;
};

export function ResultActions({ question, headline, roastComment = "", shareText }: ResultActionsProps) {
  const [message, setMessage] = useState("");

  async function shareResult() {
    const text = shareText ?? `질문: ${question}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "AI 거짓말탐지기",
          text
        });
        setMessage("공유창을 띄웠습니다.");
        return;
      }

      await navigator.clipboard.writeText(text);
      setMessage("공유 문구를 복사했습니다.");
    } catch {
      setMessage("공유가 튕겼습니다. 다시 눌러 주세요.");
    }
  }

  return (
    <div className={styles.actions}>
      <button type="button" onClick={shareResult}>
        <Share2 size={18} aria-hidden />
        공유하기
      </button>
      {headline ? <ExportRecorder question={question} headline={headline} roastComment={roastComment} /> : null}
      {message ? <p>{message}</p> : null}
    </div>
  );
}
