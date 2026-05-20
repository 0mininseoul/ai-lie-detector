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

export default async function ResultPage({ params }: ResultPageProps) {
  const { id } = await params;
  const supabase = getSupabaseServer();
  const { data: session, error } = await supabase
    .from("sessions")
    .select("id, target_question")
    .eq("id", id)
    .single<SessionRecord>();

  if (error || !session) {
    notFound();
  }

  return <ResultExperience sessionId={session.id} question={session.target_question} />;
}
