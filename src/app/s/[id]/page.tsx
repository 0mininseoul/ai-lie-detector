import { notFound } from "next/navigation";
import { SessionRecorder } from "./SessionRecorder";
import { getSupabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SessionPageProps = {
  params: Promise<{
    id: string;
  }>;
};

type SessionRecord = {
  id: string;
  status: string;
  target_question: string;
  warmup_question: string;
};

export default async function SessionPage({ params }: SessionPageProps) {
  const { id } = await params;
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("sessions")
    .select("id, status, target_question, warmup_question")
    .eq("id", id)
    .single<SessionRecord>();

  if (error || !data) {
    notFound();
  }

  return (
    <SessionRecorder
      session={{
        id: data.id,
        status: data.status,
        targetQuestion: data.target_question,
        warmupQuestion: data.warmup_question
      }}
    />
  );
}
