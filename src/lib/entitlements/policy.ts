import type { EntitlementSource, EntitlementState } from "@/lib/payments/adapters";

const FREE_TRIAL_LIMIT = 1;

const ENTITLEMENT_SOURCES = new Set<EntitlementSource>([
  "mvp",
  "polar",
  "toss_iap",
  "toss_reward_ad"
]);

export type EntitlementRecord = {
  device_id: string;
  user_id: string | null;
  kakao_user_id: string | null;
  free_trials_used: number;
  credits: number;
  source: string;
};

export function normalizeSource(source: string): EntitlementSource {
  if (ENTITLEMENT_SOURCES.has(source as EntitlementSource)) {
    return source as EntitlementSource;
  }

  return "mvp";
}

export function assertValidEntitlementSource(source: string): asserts source is EntitlementSource {
  if (!ENTITLEMENT_SOURCES.has(source as EntitlementSource)) {
    throw new Error("Invalid entitlement source");
  }
}

export function normalizeDeviceId(deviceId: string): string {
  const normalized = deviceId.trim();

  if (normalized.length < 8 || normalized.length > 128) {
    throw new Error("Device id must be between 8 and 128 characters");
  }

  return normalized;
}

function clampNonNegative(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.trunc(value));
}

export function buildEntitlementState(record: EntitlementRecord): EntitlementState {
  const freeTrialsUsed = clampNonNegative(record.free_trials_used);
  const credits = clampNonNegative(record.credits);

  return {
    deviceId: record.device_id,
    userId: record.user_id ?? undefined,
    kakaoUserId: record.kakao_user_id ?? undefined,
    freeTrialsUsed,
    credits,
    canStartAnalysis: freeTrialsUsed < FREE_TRIAL_LIMIT || credits > 0,
    source: normalizeSource(record.source)
  };
}

export function applyAnalysisConsumption(state: EntitlementState): EntitlementState {
  if (state.freeTrialsUsed < FREE_TRIAL_LIMIT) {
    const freeTrialsUsed = state.freeTrialsUsed + 1;

    return {
      ...state,
      freeTrialsUsed,
      canStartAnalysis: freeTrialsUsed < FREE_TRIAL_LIMIT || state.credits > 0
    };
  }

  if (state.credits > 0) {
    const credits = state.credits - 1;

    return {
      ...state,
      credits,
      canStartAnalysis: credits > 0
    };
  }

  throw new Error("No analysis credits available");
}

export function applyCreditGrant(
  state: EntitlementState,
  credits: number,
  source: EntitlementSource
): EntitlementState {
  const creditsToGrant = Math.trunc(credits);

  if (!Number.isFinite(creditsToGrant) || creditsToGrant <= 0) {
    throw new Error("Credits to grant must be a positive integer");
  }

  const nextCredits = state.credits + creditsToGrant;

  return {
    ...state,
    credits: nextCredits,
    canStartAnalysis: true,
    source
  };
}
