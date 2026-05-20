"use client";

import { ArrowLeft, LockKeyhole, LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { KakaoIcon } from "@/components/icons/KakaoIcon";
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
        throw new Error(data.error ?? "질문을 잠그지 못했어요. 잠시 후 다시 시도해 주세요.");
      }

      router.push(data.url);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "잠시 흔들렸어요. 한 번 더 눌러주세요.");
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
      setError("카카오 로그인을 열지 못했어요. 잠시 후 다시 시도해 주세요.");
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

      {isLoggedIn ? (
        <section className={styles.stage}>
          <div className={styles.intro}>
            <span className={styles.step}>STEP 1 / 3</span>
            <h1>질문해 볼까요?</h1>
            <p>이 한 줄이 상대 화면에 그대로 떠요. 짧고 또렷할수록 좋아요.</p>
          </div>

          <form className={styles.console} onSubmit={createSession}>
            <div className={styles.notice} data-tone="warn">
              <LockKeyhole size={18} aria-hidden />
              <div>
                <strong>지금부터 화면을 가려 주세요.</strong>
                <span>상대가 질문을 먼저 보면 재미가 반토막 나요.</span>
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
              <span className={styles.counter}>{trimmedQuestion.length}/160</span>
              <button className={styles.lockButton} type="submit" disabled={!canSubmit}>
                {isSubmitting ? "준비 중" : "질문하기"}
              </button>
            </div>

            {error ? <p className={styles.error}>{error}</p> : null}
            <p className={styles.afterLock}>질문이 등록되면 상대에게 기기를 건네주세요.</p>
          </form>
        </section>
      ) : (
        <section className={styles.gateStage}>
          <div className={styles.gateCard}>
            <span className={styles.gateLockIcon} aria-hidden>
              <LockKeyhole size={26} />
            </span>
            <h1>1초면 충분해요.</h1>
            <p>
              로그인하면 바로 질문 화면으로 이동합니다.
              <br />
              결과는 본인 계정에만 저장돼요.
            </p>
            <button
              className={styles.kakaoButton}
              type="button"
              onClick={handleKakaoLogin}
              disabled={isStartingLogin || auth.status === "loading"}
            >
              <KakaoIcon size={20} aria-hidden />
              {isStartingLogin ? "카카오 여는 중" : "카카오로 1초 만에 시작하기"}
            </button>
            <Link href="/signup" className={styles.emailButton}>
              이메일로 로그인
            </Link>
            {error ? <p className={styles.gateError}>{error}</p> : null}
            {auth.error ? <p className={styles.gateError}>{auth.error}</p> : null}
          </div>
        </section>
      )}
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
