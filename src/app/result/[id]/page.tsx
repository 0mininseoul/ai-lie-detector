import { notFound } from "next/navigation";
import { ResultActions } from "./ResultActions";
import styles from "./result.module.css";
import { getSupabaseServer } from "@/lib/supabase/server";
import type { Headline } from "@/types/domain";

export const dynamic = "force-dynamic";

type ResultPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type SessionRecord = {
  id: string;
  target_question: string;
};

type ResultRecord = {
  headline: Headline;
  roast_comment: string;
  public_json: {
    share_text?: string;
  } | null;
};

export default async function ResultPage({ params }: ResultPageProps) {
  const { id } = await params;
  const supabase = getSupabaseServer();
  const [{ data: session, error: sessionError }, { data: result, error: resultError }] = await Promise.all([
    supabase.from("sessions").select("id, target_question").eq("id", id).single<SessionRecord>(),
    supabase
      .from("analysis_results")
      .select("headline, roast_comment, public_json")
      .eq("session_id", id)
      .maybeSingle<ResultRecord>()
  ]);

  if (sessionError) {
    if (sessionError.code !== "PGRST116") {
      throw new Error("Failed to load session");
    }
    notFound();
  }

  if (!session) {
    notFound();
  }

  if (resultError) {
    throw new Error("Failed to load result");
  }

  if (!result) {
    return (
      <main className={styles.shell}>
        <section className={styles.pending}>
          <span>AI 거짓말탐지기</span>
          <p>아직 판정 중이야. AI가 지금 표정값이랑 대답 흐름 붙잡고 씨름 중.</p>
          <ResultActions question={session.target_question} />
        </section>
      </main>
    );
  }

  const shareText =
    result.public_json?.share_text ??
    `질문: ${session.target_question} / 판정: ${result.headline} / ${result.roast_comment}`;

  return (
    <main className={styles.shell}>
      <section className={styles.result} aria-label="거짓말탐지기 결과">
        <div className={styles.brand}>AI 거짓말탐지기</div>
        <h1>{result.headline}</h1>
        <p className={styles.roast}>{result.roast_comment}</p>

        <div className={styles.questionBlock}>
          <span>질문</span>
          <p>{session.target_question}</p>
        </div>

        <ResultActions question={session.target_question} headline={result.headline} shareText={shareText} />
      </section>
    </main>
  );
}
