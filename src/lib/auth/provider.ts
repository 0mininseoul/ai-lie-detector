type SupabaseIdentityLike = {
  provider?: string;
  id?: string;
  identity_data?: Record<string, unknown>;
};

type SupabaseUserLike = {
  identities?: SupabaseIdentityLike[] | null;
  user_metadata?: Record<string, unknown>;
} | null;

export function getKakaoProviderId(user: SupabaseUserLike) {
  const kakaoIdentity = user?.identities?.find((identity) => identity.provider === "kakao");

  if (typeof kakaoIdentity?.id === "string" && kakaoIdentity.id.trim()) {
    return kakaoIdentity.id;
  }

  const identityProviderId = kakaoIdentity?.identity_data?.provider_id;
  if (typeof identityProviderId === "string" && identityProviderId.trim()) {
    return identityProviderId;
  }

  const identitySub = kakaoIdentity?.identity_data?.sub;
  if (typeof identitySub === "string" && identitySub.trim()) {
    return identitySub;
  }

  const metadataProviderId = user?.user_metadata?.provider_id;
  if (typeof metadataProviderId === "string" && metadataProviderId.trim()) {
    return metadataProviderId;
  }

  return null;
}
