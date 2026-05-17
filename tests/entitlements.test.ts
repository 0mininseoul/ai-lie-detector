import { describe, expect, it } from "vitest";
import {
  applyAnalysisConsumption,
  applyCreditGrant,
  assertValidEntitlementSource,
  buildEntitlementState,
  normalizeDeviceId,
  type EntitlementRecord
} from "@/lib/entitlements/policy";

const baseRecord: EntitlementRecord = {
  device_id: "device-1",
  user_id: null,
  kakao_user_id: null,
  free_trials_used: 0,
  credits: 0,
  source: "mvp"
};

describe("entitlement policy", () => {
  it("allows the first free run", () => {
    const state = buildEntitlementState(baseRecord);

    expect(state.canStartAnalysis).toBe(true);
    expect(applyAnalysisConsumption(state)).toMatchObject({
      freeTrialsUsed: 1,
      credits: 0,
      canStartAnalysis: false
    });
  });

  it("blocks after the free run when no credits remain", () => {
    const state = buildEntitlementState({
      ...baseRecord,
      free_trials_used: 1
    });

    expect(state.canStartAnalysis).toBe(false);
    expect(() => applyAnalysisConsumption(state)).toThrow("No analysis credits available");
  });

  it("allows paid credits after the free run without going negative", () => {
    const state = buildEntitlementState({
      ...baseRecord,
      free_trials_used: 1,
      credits: 2,
      source: "polar"
    });

    expect(state.canStartAnalysis).toBe(true);
    expect(applyAnalysisConsumption(state)).toMatchObject({
      freeTrialsUsed: 1,
      credits: 1,
      canStartAnalysis: true,
      source: "polar"
    });
  });

  it("rejects invalid credit grants", () => {
    const state = buildEntitlementState(baseRecord);

    expect(() => applyCreditGrant(state, 0, "polar")).toThrow("Credits to grant must be a positive integer");
    expect(() => applyCreditGrant(state, -1, "polar")).toThrow("Credits to grant must be a positive integer");
  });

  it("normalizes valid device ids and rejects invalid ones", () => {
    expect(normalizeDeviceId("  device-123  ")).toBe("device-123");
    expect(() => normalizeDeviceId("short")).toThrow("Device id must be between 8 and 128 characters");
    expect(() => normalizeDeviceId("x".repeat(129))).toThrow("Device id must be between 8 and 128 characters");
  });

  it("rejects invalid entitlement sources at runtime", () => {
    expect(() => assertValidEntitlementSource("polar")).not.toThrow();
    expect(() => assertValidEntitlementSource("stripe")).toThrow("Invalid entitlement source");
  });
});
