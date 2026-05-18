import { NextResponse } from "next/server";
import { z } from "zod";
import { refundFreeTrialForSession } from "@/lib/entitlements/service";

type RouteContext = {
  params: Promise<{
    id: string;
  }>;
};

const sessionIdSchema = z.uuid();

export async function POST(request: Request, context: RouteContext) {
  void request;
  const { id } = await context.params;
  const sessionId = sessionIdSchema.safeParse(id);

  if (!sessionId.success) {
    return NextResponse.json({ error: "Invalid session id" }, { status: 400 });
  }

  try {
    const entitlement = await refundFreeTrialForSession(sessionId.data);
    return NextResponse.json({
      refunded: true,
      entitlement: {
        freeTrialsUsed: entitlement.freeTrialsUsed,
        credits: entitlement.credits,
        canStartAnalysis: entitlement.canStartAnalysis
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to refund";
    const status = message.includes("Session not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
