"use client";

import { LockKeyhole, MessageCircle, ShieldQuestion } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { signInWithKakao } from "@/lib/auth/kakao";
import styles from "./page.module.css";

const sampleQuestions = [
  "어제 누구랑 있었어?",
  "나 몰래 연락하는 사람 있어?",
  "최근에 숨긴 거 하나라도 있어?"
];

export default function HomePage() {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const trimmedQuestion = question.trim();

  const canSubmit = useMemo(() => trimmedQuestion.length >= 3 && !isSubmitting, [isSubmitting, trimmedQuestion]);

  async function createSession(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          creatorDeviceId: getDeviceId(),
          targetQuestion: trimmedQuestion,
          locale: "ko"
        })
      });
      const data = (await response.json()) as { url?: string; error?: string };

      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "질문 잠그기에 실패했습니다.");
      }

      router.push(data.url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "잠깐 삐끗했습니다. 다시 눌러 주세요.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleKakaoLogin() {
    try {
      setError("");
      await signInWithKakao("/");
    } catch {
      setError("카카오 로그인을 시작하지 못했습니다. Supabase/Kakao 설정을 확인해 주세요.");
    }
  }

  return (
    <main className={styles.shell}>
      <section className={styles.hero} aria-labelledby="home-title">
        <div className={styles.copy}>
          <div className={styles.kicker}>
            <ShieldQuestion size={18} aria-hidden />
            AI Vision 기반 진위 판단
          </div>
          <h1 id="home-title">AI 거짓말탐지기</h1>
          <p className={styles.lead}>착한 내 남자친구, 과연 나한테 거짓말하는 게 없을까?</p>
          <p className={styles.subcopy}>AI는 과연 거짓말을 알아챌 수 있을까?</p>
        </div>

        <form className={styles.console} onSubmit={createSession}>
          <div className={styles.loginRow}>
            <button className={styles.kakaoButton} type="button" aria-label="카카오 로그인" onClick={handleKakaoLogin}>
              <MessageCircle size={18} aria-hidden />
              카카오로 시작하기
            </button>
            <span className={styles.loginHint}>MVP에서는 이 기기 기준으로 바로 시작합니다.</span>
          </div>

          <div className={styles.hideNotice}>
            <LockKeyhole size={20} aria-hidden />
            <div>
              <strong>지금은 화면을 가려 주세요.</strong>
              <span>상대가 질문을 먼저 보면 재미가 반토막 납니다.</span>
            </div>
          </div>

          <label className={styles.questionLabel} htmlFor="target-question">
            물어볼 질문
          </label>
          <textarea
            id="target-question"
            className={styles.questionInput}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="어제 누구랑 있었어?"
            maxLength={160}
            rows={4}
          />

          <div className={styles.sampleRow} aria-label="예시 질문">
            {sampleQuestions.map((sample) => (
              <button key={sample} type="button" onClick={() => setQuestion(sample)}>
                {sample}
              </button>
            ))}
          </div>

          <div className={styles.actionRow}>
            <span>{trimmedQuestion.length}/160</span>
            <button className={styles.lockButton} type="submit" disabled={!canSubmit}>
              {isSubmitting ? "잠그는 중" : "질문 잠그기"}
            </button>
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
          <p className={styles.afterLock}>잠그면 이제 상대에게 기기를 넘겨 주세요. 질문 문장은 그대로 보여집니다.</p>
        </form>
      </section>
    </main>
  );
}

function getDeviceId() {
  const key = "ai-lie-detector-device-id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const value =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(key, value);
  return value;
}
