import type { SelfServiceRankValue } from "@/domain/value-objects/member-rank";

export type OnboardingCheckoutSessionInput = {
  userId: string;
  clerkUserId: string;
  stripeCustomerId: string;
  rank: SelfServiceRankValue;
};

export interface OnboardingCheckoutGateway {
  // 会員1人につき1つのStripe Customerを作る。作ったIDはusers.stripe_customer_idに保存して再利用する
  createCustomer(input: {
    userId: string;
    clerkUserId: string;
    email: string;
  }): Promise<string>;
  // 新しく決済させると二重課金になる（解約・失効していない）サブスクリプションがあるか
  hasActiveSubscription(stripeCustomerId: string): Promise<boolean>;
  // Checkout SessionのURLを返す
  createCheckoutSession(
    input: OnboardingCheckoutSessionInput
  ): Promise<string | null>;
}
