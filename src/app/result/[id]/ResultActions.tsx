"use client";

import { Plus, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { Headline } from "@/types/domain";
import styles from "./ResultExperience.module.css";

const ReelsComposer = dynamic(
  () => import("@/components/export/ReelsComposer").then((m) => m.ReelsComposer),
  { ssr: false }
);

type Props = {
  question: string;
  videoSrc: string | null;
  headline: Headline | null;
  roastComment: string;
  shareText: string;
  disabled: boolean;
};

export function ResultActions({ question, videoSrc, headline, roastComment, shareText, disabled }: Props) {
  const router = useRouter();
  const [toast, setToast] = useState("");

  async function share() {
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: "AI 거짓말탐지기",
          text: shareText,
          url: window.location.href
        });
        return;
      }
      await navigator.clipboard.writeText(`${shareText}\n${window.location.href}`);
      setToast("공유 문구를 복사했어요.");
      window.setTimeout(() => setToast(""), 1800);
    } catch {
      setToast("공유가 막혔어요. 다시 눌러 주세요.");
      window.setTimeout(() => setToast(""), 1800);
    }
  }

  return (
    <div className={styles.actionBar} data-disabled={disabled} aria-hidden={disabled}>
      <button type="button" onClick={share} className={styles.primaryAction} disabled={disabled}>
        <Share2 size={18} aria-hidden />
        공유하기
      </button>
      {headline && videoSrc ? (
        <ReelsComposer
          videoSrc={videoSrc}
          question={question}
          headline={headline}
          roastComment={roastComment}
        />
      ) : null}
      <button
        type="button"
        onClick={() => router.replace("/new")}
        className={styles.secondaryAction}
      >
        <Plus size={16} aria-hidden />
        새 질문
      </button>
      {toast ? <p className={styles.toast}>{toast}</p> : null}
    </div>
  );
}
