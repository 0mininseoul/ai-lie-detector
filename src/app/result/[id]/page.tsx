import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { shareImageUrl } from "@/lib/sessions/video-url";
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

type TargetSegmentTiming = {
  duration_ms: number;
};

function getSiteUrl() {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "https://nogoora.vercel.app").replace(/\/$/, "");
}

export async function generateMetadata({ params }: ResultPageProps): Promise<Metadata> {
  const { id } = await params;
  const supabase = getSupabaseServer();
  const sessionResponse = await supabase
    .from("sessions")
    .select("id, target_question")
    .eq("id", id)
    .maybeSingle<SessionRecord>();

  const siteUrl = getSiteUrl();
  const pageUrl = `${siteUrl}/result/${id}`;
  const imageUrl = shareImageUrl(id);
  const title = "AI 거짓말탐지기";
  const description = "아래 버튼을 눌러 결과를 확인하세요.";

  if (sessionResponse.error || !sessionResponse.data) {
    return {
      title,
      description
    };
  }

  return {
    title,
    description,
    alternates: {
      canonical: pageUrl
    },
    openGraph: {
      title,
      description,
      url: pageUrl,
      siteName: "AI 거짓말탐지기",
      type: "website",
      images: imageUrl
        ? [
            {
              url: imageUrl,
              width: 1080,
              height: 1440,
              alt: "AI 거짓말탐지기 분석 결과"
            }
          ]
        : undefined
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: imageUrl ? [imageUrl] : undefined
    }
  };
}

export default async function ResultPage({ params }: ResultPageProps) {
  const { id } = await params;
  const supabase = getSupabaseServer();
  const [sessionResponse, recordingResponse, targetSegmentResponse] = await Promise.all([
    supabase
      .from("sessions")
      .select("id, target_question")
      .eq("id", id)
      .single<SessionRecord>(),
    supabase
      .from("recordings")
      .select("target_start_ms, target_end_ms")
      .eq("session_id", id)
      .maybeSingle<RecordingTiming>(),
    supabase
      .from("recording_segments")
      .select("duration_ms")
      .eq("session_id", id)
      .eq("segment", "target")
      .maybeSingle<TargetSegmentTiming>()
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
        targetSegmentResponse.data
          ? {
              targetStartMs: 0,
              targetEndMs: targetSegmentResponse.data.duration_ms
            }
          : recordingResponse.data
          ? {
              targetStartMs: recordingResponse.data.target_start_ms,
              targetEndMs: recordingResponse.data.target_end_ms
            }
          : null
      }
    />
  );
}
