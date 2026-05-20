"use client";

import { ArrowLeft, MessageCircle } from "lucide-react";
import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import styles from "./signup.module.css";

const currentYear = new Date().getFullYear();
const birthYearOptions = Array.from({ length: currentYear - 1924 + 1 }, (_, index) => currentYear - index);

export default function SignupPage() {
  const [name, setName] = useState("");
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [phone3, setPhone3] = useState("");
  const [gender, setGender] = useState("");
  const [birthYear, setBirthYear] = useState("");
  const [agreeAge, setAgreeAge] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [agreePrivacy, setAgreePrivacy] = useState(false);

  const allAgreed = agreeAge && agreeTerms && agreePrivacy;

  const canSubmit = useMemo(() => {
    return (
      name.trim().length >= 1 &&
      phone1.length === 3 &&
      phone2.length === 4 &&
      phone3.length === 4 &&
      gender !== "" &&
      birthYear !== "" &&
      allAgreed
    );
  }, [name, phone1, phone2, phone3, gender, birthYear, allAgreed]);

  function toggleAll(next: boolean) {
    setAgreeAge(next);
    setAgreeTerms(next);
    setAgreePrivacy(next);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // 이 화면은 카카오 개인정보 동의항목 신청 심사용으로 제출되는 회원가입 화면입니다.
    // 실제 가입 처리는 카카오 OAuth 플로우에서 수행되며, 이 폼은 수집하는 항목을
    // 검토자에게 보여주기 위한 시나리오 화면입니다.
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <Link href="/new" className={styles.back}>
          <ArrowLeft size={16} aria-hidden />
          돌아가기
        </Link>
        <Link href="/new" className={styles.kakaoSwitch}>
          <MessageCircle size={14} aria-hidden />
          카카오로 시작
        </Link>
      </header>

      <section className={styles.stage}>
        <div className={styles.intro}>
          <span className={styles.step}>회원가입</span>
          <h1>먼저 본인 정보를 알려 주세요.</h1>
          <p>
            AI 거짓말탐지기는 결과 정확도를 위해 아래 정보를 받습니다. 모든 항목은 암호화되어 저장되며,
            회원 탈퇴 시 즉시 파기됩니다.
          </p>
        </div>

        <form className={styles.card} onSubmit={handleSubmit} noValidate>
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>필수 회원정보</h2>
              <span className={styles.sectionBadge}>REQUIRED</span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-name">
                이름 <span className={styles.requiredMark}>*</span>
              </label>
              <input
                id="signup-name"
                className={styles.input}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="홍길동"
                autoComplete="name"
                maxLength={20}
              />
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-phone-1">
                휴대전화번호 <span className={styles.requiredMark}>*</span>
              </label>
              <div className={styles.phoneRow}>
                <input
                  id="signup-phone-1"
                  className={styles.input}
                  type="tel"
                  inputMode="numeric"
                  value={phone1}
                  onChange={(event) => setPhone1(event.target.value.replace(/\D/g, "").slice(0, 3))}
                  placeholder="010"
                  maxLength={3}
                  autoComplete="tel-area-code"
                />
                <span className={styles.phoneDash} aria-hidden>
                  -
                </span>
                <input
                  className={styles.input}
                  type="tel"
                  inputMode="numeric"
                  value={phone2}
                  onChange={(event) => setPhone2(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                  maxLength={4}
                  autoComplete="tel-local-prefix"
                />
                <span className={styles.phoneDash} aria-hidden>
                  -
                </span>
                <input
                  className={styles.input}
                  type="tel"
                  inputMode="numeric"
                  value={phone3}
                  onChange={(event) => setPhone3(event.target.value.replace(/\D/g, "").slice(0, 4))}
                  placeholder="0000"
                  maxLength={4}
                  autoComplete="tel-local-suffix"
                />
              </div>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>
                성별 <span className={styles.requiredMark}>*</span>
              </span>
              <div className={styles.genderRow} role="radiogroup" aria-label="성별">
                <label className={styles.genderOption}>
                  <input
                    type="radio"
                    name="gender"
                    value="female"
                    checked={gender === "female"}
                    onChange={() => setGender("female")}
                  />
                  <span className="dot" aria-hidden />
                  여성
                </label>
                <label className={styles.genderOption}>
                  <input
                    type="radio"
                    name="gender"
                    value="male"
                    checked={gender === "male"}
                    onChange={() => setGender("male")}
                  />
                  <span className="dot" aria-hidden />
                  남성
                </label>
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="signup-birth-year">
                출생연도 <span className={styles.requiredMark}>*</span>
              </label>
              <select
                id="signup-birth-year"
                className={styles.input}
                value={birthYear}
                onChange={(event) => setBirthYear(event.target.value)}
              >
                <option value="">출생연도를 선택해 주세요</option>
                {birthYearOptions.map((year) => (
                  <option key={year} value={String(year)}>
                    {year}년
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <h2 className={styles.sectionTitle}>약관 동의</h2>
              <span className={styles.sectionBadge}>REQUIRED</span>
            </div>

            <div className={styles.terms}>
              <label className={styles.termsAll}>
                <input
                  type="checkbox"
                  className={styles.cbox}
                  checked={allAgreed}
                  onChange={(event) => toggleAll(event.target.checked)}
                />
                <span>전체 동의</span>
              </label>

              <div className={styles.termsRow}>
                <label>
                  <input
                    type="checkbox"
                    className={styles.cbox}
                    checked={agreeAge}
                    onChange={(event) => setAgreeAge(event.target.checked)}
                  />
                  <span>
                    <span className={styles.req}>[필수]</span>만 14세 이상입니다
                  </span>
                </label>
              </div>

              <div className={styles.termsRow}>
                <label>
                  <input
                    type="checkbox"
                    className={styles.cbox}
                    checked={agreeTerms}
                    onChange={(event) => setAgreeTerms(event.target.checked)}
                  />
                  <span>
                    <span className={styles.req}>[필수]</span>이용약관 동의
                  </span>
                </label>
                <Link href="/legal/terms" target="_blank" rel="noopener noreferrer">
                  보기
                </Link>
              </div>

              <div className={styles.termsRow}>
                <label>
                  <input
                    type="checkbox"
                    className={styles.cbox}
                    checked={agreePrivacy}
                    onChange={(event) => setAgreePrivacy(event.target.checked)}
                  />
                  <span>
                    <span className={styles.req}>[필수]</span>개인정보 수집·이용 동의
                  </span>
                </label>
                <Link href="/legal/privacy" target="_blank" rel="noopener noreferrer">
                  보기
                </Link>
              </div>
            </div>
          </div>

          <div className={styles.actionRow}>
            <button type="submit" className={styles.submit} disabled={!canSubmit}>
              회원가입
            </button>
            <p className={styles.altRow}>
              이미 계정이 있으신가요?
              <Link href="/new">로그인</Link>
            </p>
          </div>
        </form>
      </section>
    </main>
  );
}
