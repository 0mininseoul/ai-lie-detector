"use client";

import { Download, Share2 } from "lucide-react";
import { useState } from "react";
import styles from "./result.module.css";
import type { Headline } from "@/types/domain";

type ResultActionsProps = {
  question: string;
  headline?: Headline;
  shareText?: string;
};

export function ResultActions({ question, headline, shareText }: ResultActionsProps) {
  const [message, setMessage] = useState("");

  async function shareResult() {
    const text = shareText ?? `질문: ${question}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: "AI 거짓말탐지기",
          text
        });
        setMessage("공유창 띄웠어.");
        return;
      }

      await navigator.clipboard.writeText(text);
      setMessage("공유 문구 복사했어.");
    } catch {
      setMessage("공유가 튕겼어. 다시 눌러봐.");
    }
  }

  return (
    <div className={styles.actions}>
      <button type="button" onClick={shareResult}>
        <Share2 size={18} aria-hidden />
        공유하기
      </button>
      <button type="button" disabled={!headline} aria-disabled={!headline}>
        <Download size={18} aria-hidden />
        영상 내보내기
      </button>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
