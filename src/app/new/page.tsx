"use client";

import { ArrowLeft, LockKeyhole, LogOut, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { getAvatarUrl, getDisplayName, useSupabaseUser } from "@/hooks/useSupabaseUser";
import { signInWithKakao } from "@/lib/auth/kakao";
import styles from "./new.module.css";

const sampleQuestions = [
  "어제 누구랑 있었어?",
  "나 몰래 연락하는 사람 있어?",
  "최근에 숨긴 거 하나라도 있어?"
];

export default function NewQuestionPage() {
  const router = useRouter();
  const auth = useSupabaseUser();
  const [question, setQuestion] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStartingLogin, setIsStartingLogin] = useState(false);
  const [error, setError] = useState("");
  const trimmedQuestion = question.trim();
  const isLoggedIn = Boolean(auth.user);
  const displayName = getDisplayName(auth.user);
  const avatarUrl = getAvatarUrl(auth.user);

  const canSubmit = useMemo(
    () => isLoggedIn && trimmedQuestion.length >= 3 && !isSubmitting,
    [isLoggedIn, isSubmitting, trimmedQuestion]
  );

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
    setError("");
    setIsStartingLogin(true);
    try {
      await signInWithKakao("/new");
    } catch {
      setError("카카오 로그인을 시작하지 못했습니다. Supabase/Kakao 설정을 확인해 주세요.");
      setIsStartingLogin(false);
    }
  }

  async function handleSignOut() {
    setError("");
    await auth.signOut();
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/" className={styles.back}>
          <ArrowLeft size={16} aria-hidden />
          돌아가기
        </Link>
        {isLoggedIn ? (
          <div className={styles.profile}>
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" aria-hidden />
            ) : (
              <span className={styles.avatarFallback} aria-hidden>
                {displayName.slice(0, 1)}
              </span>
            )}
            <strong>{displayName}</strong>
            <button type="button" onClick={handleSignOut} aria-label="로그아웃">
              <LogOut size={14} aria-hidden />
            </button>
          </div>
        ) : null}
      </header>

      <section className={styles.stage}>
        <div className={styles.intro}>
          <span className={styles.step}>STEP 1 / 3</span>
          <h1>물어볼 질문 한 줄.</h1>
          <p>이 질문 그대로 상대 화면에 띄워집니다. 너무 길게 쓰면 김 빠지니까 한 호흡 안에 끝내세요.</p>
        </div>

        <form className={styles.console} onSubmit={createSession} data-locked={!isLoggedIn}>
          {isLoggedIn ? (
            <div className={styles.notice} data-tone="warn">
              <LockKeyhole size={18} aria-hidden />
              <div>
                <strong>지금부터 화면을 가려 주세요.</strong>
                <span>상대가 질문을 먼저 보면 재미가 반토막 납니다.</span>
              </div>
            </div>
          ) : (
            <div className={styles.notice} data-tone="login">
              <LockKeyhole size={18} aria-hidden />
              <div>
                <strong>카카오로 로그인하면 질문을 잠글 수 있어요.</strong>
                <span>결과는 본인 계정에만 저장되고, 공유는 본인이 직접 누를 때만 열립니다.</span>
              </div>
            </div>
          )}

          <label className={styles.questionLabel} htmlFor="target-question">
            물어볼 질문
          </label>
          <div className={styles.questionWrap}>
            <textarea
              id="target-question"
              className={styles.questionInput}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder={isLoggedIn ? "어제 누구랑 있었어?" : "로그인하면 질문을 적을 수 있어요"}
              maxLength={160}
              rows={4}
              disabled={!isLoggedIn}
              aria-disabled={!isLoggedIn}
            />
            {!isLoggedIn ? (
              <div className={styles.lockedVeil} aria-hidden>
                <LockKeyhole size={22} />
                <span>카카오로 시작하면 잠금 해제</span>
              </div>
            ) : null}
          </div>

          <div className={styles.sampleRow} aria-label="예시 질문">
            {sampleQuestions.map((sample) => (
              <button
                key={sample}
                type="button"
                onClick={() => setQuestion(sample)}
                disabled={!isLoggedIn}
              >
                {sample}
              </button>
            ))}
          </div>

          <div className={styles.actionRow}>
            <span className={styles.counter}>{trimmedQuestion.length}/160</span>
            {isLoggedIn ? (
              <button className={styles.lockButton} type="submit" disabled={!canSubmit}>
                {isSubmitting ? "잠그는 중" : "질문 잠그기"}
              </button>
            ) : (
              <button
                className={styles.kakaoButton}
                type="button"
                onClick={handleKakaoLogin}
                disabled={isStartingLogin || auth.status === "loading"}
              >
                <MessageCircle size={16} aria-hidden />
                {isStartingLogin ? "카카오 여는 중" : "카카오로 시작하기"}
              </button>
            )}
          </div>

          {error ? <p className={styles.error}>{error}</p> : null}
          {auth.error ? <p className={styles.error}>{auth.error}</p> : null}
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
