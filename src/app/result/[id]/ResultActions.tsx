"use client";

import { Plus, Share2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Headline } from "@/types/domain";
import { hasKakaoShareConfig, prepareKakaoShare, shareResultWithKakao } from "@/lib/kakao/share";
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
  ensureShareImage?: () => Promise<boolean>;
  shareImageReady: boolean;
  disabled: boolean;
};

export function ResultActions({
  sessionId,
  question,
  videoSrc,
  headline,
  roastComment,
  ensureShareImage,
  shareImageReady,
  disabled
}: Props) {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [kakaoReady, setKakaoReady] = useState(false);

  useEffect(() => {
    if (!hasKakaoShareConfig()) return;

    let active = true;
    void prepareKakaoShare().then((ready) => {
      if (active) setKakaoReady(ready);
    });

    return () => {
      active = false;
    };
  }, []);

  async function share() {
    const shareUrl = `${window.location.origin}/result/${sessionId}`;

    if (!shareImageReady) {
      showToast("공유 이미지를 준비하고 있어요.");
      const ready = await ensureShareImage?.();
      if (!ready) {
        showToast("공유 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setToast("");
    }

    const kakaoShared = shareResultWithKakao({
      url: shareUrl,
      question,
      imageUrl: shareImageUrl(sessionId)
    });
    if (kakaoShared) return;

    if (hasKakaoShareConfig()) {
      if (!kakaoReady) {
        void prepareKakaoShare().then((ready) => setKakaoReady(ready));
      }
      showToast("카카오 공유를 준비 중이에요. 잠시 후 다시 눌러 주세요.");
      return;
    }

    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      showToast("링크를 복사했어요.");
    } catch (error) {
      if (isShareDismissed(error)) return;
      showToast("공유가 막혔어요. 다시 눌러 주세요.");
    }
  }

  function showToast(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 1800);
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

function isShareDismissed(error: unknown) {
  return error instanceof DOMException && (error.name === "AbortError" || error.name === "NotAllowedError");
}
