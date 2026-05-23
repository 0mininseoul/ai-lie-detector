import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { ResultExperience } from "./ResultExperience";

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

type RecordingTiming = {
  target_start_ms: number;
  target_end_ms: number;
};

export default async function ResultPage({ params }: ResultPageProps) {
  const { id } = await params;
  const supabase = getSupabaseServer();
  const [sessionResponse, recordingResponse] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, target_question")
      .eq("id", id)
      .single<SessionRecord>(),
    supabase
      .from("recordings")
      .select("target_start_ms, target_end_ms")
      .eq("session_id", id)
      .maybeSingle<RecordingTiming>()
  ]);

  const { data: session, error } = sessionResponse;

  if (error || !session) {
    notFound();
  }

  return (
    <ResultExperience
      sessionId={session.id}
      question={session.target_question}
      initialTiming={
        recordingResponse.data
          ? {
              targetStartMs: recordingResponse.data.target_start_ms,
              targetEndMs: recordingResponse.data.target_end_ms
            }
          : null
      }
    />
  );
}
