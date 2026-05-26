export type EntitlementSource = "mvp" | "polar" | "toss_iap" | "toss_reward_ad";
export type PaymentProvider = "polar" | "toss_iap" | "toss_reward_ad" | "manual";

export type EntitlementState = {
  deviceId: string;
  userId?: string;
  kakaoUserId?: string;
  freeTrialsUsed: number;
  credits: number;
  hasActivePass: boolean;
  passExpiresAt?: string;
  canStartAnalysis: boolean;
  source: EntitlementSource;
};

export type CreditGrant = {
  deviceId: string;
  userId?: string;
  kakaoUserId?: string;
  credits: number;
  source: EntitlementSource;
  provider: PaymentProvider;
  providerEventId: string;
};

export type CheckoutInput = {
  deviceId: string;
  userId?: string;
  kakaoUserId?: string;
  productId: string;
  credits: number;
  successUrl: string;
  cancelUrl: string;
};

export type WebhookContext = {
  provider: PaymentProvider;
  signatureHeader?: string;
  rawBody: string;
};

export type PaymentAdapter = {
  source: EntitlementSource;
  createCheckout?: (input: CheckoutInput) => Promise<{ url: string; providerCheckoutId?: string }>;
  handleWebhook?: (context: WebhookContext) => Promise<CreditGrant | null>;
};

export type RewardAdapter = {
  source: "toss_reward_ad";
  grantReward: (input: {
    deviceId: string;
    userId?: string;
    kakaoUserId?: string;
    rewardId: string;
    impressionId: string;
  }) => Promise<CreditGrant>;
};

export const nonePaymentAdapter: PaymentAdapter = {
  source: "mvp"
};
