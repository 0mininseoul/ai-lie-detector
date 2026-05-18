import "server-only";

import type { EntitlementSource, EntitlementState } from "@/lib/payments/adapters";
import {
  assertValidEntitlementSource,
  buildEntitlementState,
  normalizeDeviceId,
  type EntitlementRecord
} from "@/lib/entitlements/policy";

const ENTITLEMENT_COLUMNS = "device_id,user_id,kakao_user_id,free_trials_used,credits,source";

function toRecord(data: unknown): EntitlementRecord {
  const record = data as EntitlementRecord | null;

  if (!record?.device_id) {
    throw new Error("Entitlement record was not returned");
  }

  return record;
}

async function upsertEntitlement(deviceId: string): Promise<EntitlementRecord> {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const { getSupabaseServer } = await import("@/lib/supabase/server");
  const supabase = getSupabaseServer();
  const { data, error } = await supabase
    .from("entitlements")
    .upsert({ device_id: normalizedDeviceId }, { onConflict: "device_id" })
    .select(ENTITLEMENT_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Failed to upsert entitlement: ${error.message}`);
  }

  return toRecord(data);
}

export async function getEntitlementState(deviceId: string): Promise<EntitlementState> {
  const record = await upsertEntitlement(deviceId);

  return buildEntitlementState(record);
}

export async function consumeAnalysisCredit(deviceId: string): Promise<EntitlementState> {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const { getSupabaseServer } = await import("@/lib/supabase/server");
  const supabase = getSupabaseServer();
  const { data, error } = await supabase.rpc("consume_analysis_credit", {
    p_device_id: normalizedDeviceId
  });

  if (error) {
    throw new Error(`Failed to consume analysis credit: ${error.message}`);
  }

  return buildEntitlementState(toRecord(data));
}

export async function refundFreeTrialForSession(sessionId: string): Promise<EntitlementState> {
  const { getSupabaseServer } = await import("@/lib/supabase/server");
  const supabase = getSupabaseServer();
  const { data, error } = await supabase.rpc("refund_free_trial", {
    p_session_id: sessionId
  });

  if (error) {
    throw new Error(`Failed to refund free trial: ${error.message}`);
  }

  return buildEntitlementState(toRecord(data));
}

export async function grantCredits(
  deviceId: string,
  credits: number,
  source: EntitlementSource,
  providerEventId = crypto.randomUUID()
): Promise<EntitlementState> {
  const normalizedDeviceId = normalizeDeviceId(deviceId);
  const creditsToGrant = Math.trunc(credits);
  assertValidEntitlementSource(source);

  if (!Number.isFinite(creditsToGrant) || creditsToGrant <= 0) {
    throw new Error("Credits to grant must be a positive integer");
  }

  const { getSupabaseServer } = await import("@/lib/supabase/server");
  const supabase = getSupabaseServer();
  const { data, error } = await supabase.rpc("grant_entitlement_credits", {
    p_device_id: normalizedDeviceId,
    p_credits: creditsToGrant,
    p_source: source,
    p_provider: source,
    p_provider_event_id: providerEventId
  });

  if (error) {
    throw new Error(`Failed to grant credits: ${error.message}`);
  }

  return buildEntitlementState(toRecord(data));
}
