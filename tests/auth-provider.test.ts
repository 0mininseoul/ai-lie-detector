import { describe, expect, it } from "vitest";
import { getKakaoProviderId } from "@/lib/auth/provider";

describe("auth provider helpers", () => {
  it("extracts Kakao provider id from Supabase identities", () => {
    expect(
      getKakaoProviderId({
        identities: [
          { provider: "github", id: "git-1" },
          { provider: "kakao", id: "kakao-123" }
        ]
      })
    ).toBe("kakao-123");
  });

  it("falls back to Kakao identity data when id is absent", () => {
    expect(
      getKakaoProviderId({
        identities: [
          {
            provider: "kakao",
            identity_data: {
              provider_id: "provider-456"
            }
          }
        ]
      })
    ).toBe("provider-456");
  });

  it("returns null when user is missing or not Kakao-authenticated", () => {
    expect(getKakaoProviderId(null)).toBeNull();
    expect(getKakaoProviderId({ identities: [{ provider: "google", id: "google-1" }] })).toBeNull();
  });
});
