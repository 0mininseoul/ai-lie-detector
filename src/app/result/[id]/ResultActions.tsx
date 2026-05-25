"use client";

import { Plus, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import dynamic from "next/dynamic";
import type { Headline } from "@/types/domain";
import { shareResultWithKakao } from "@/lib/kakao/share";
import { shareImageUrl } from "@/lib/sessions/video-url";
import styles from "./ResultExperience.module.css";

const ReelsComposer = dynamic(
  () => import("@/components/export/ReelsComposer").then((m) => m.ReelsComposer),
  { ssr: false }
);

type Props = {
  sessionId: string;
  question: string;
  videoSrc: string | null;
  headline: Headline | null;
  roastComment: string;
  ensureShareImage?: () => Promise<void>;
  disabled: boolean;
};

export function ResultActions({ sessionId, question, videoSrc, headline, roastComment, ensureShareImage, disabled }: Props) {
  const router = useRouter();
  const [toast, setToast] = useState("");

  async function share() {
    try {
      await ensureShareImage?.();
      const shareUrl = `${window.location.origin}/result/${sessionId}`;
      const kakaoShared = await shareResultWithKakao({
        url: shareUrl,
        question,
        imageUrl: shareImageUrl(sessionId)
      });
      if (kakaoShared) return;

      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      setToast("링크를 복사했어요.");
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
