import type { SelfServiceRankValue } from "@/domain/value-objects/member-rank";
import type { Money } from "@/domain/value-objects/money";

/** 入会のCheckoutで支払った金額（税込） */
export type OnboardingCharge = {
  initialFee: Money;
  monthlyFee: Money;
};

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
    // 請求書（Invoice PDF）の宛名
    name: string;
  }): Promise<string>;
  // 新しく決済させると二重課金になる（解約・失効していない）サブスクリプションがあるか
  hasActiveSubscription(stripeCustomerId: string): Promise<boolean>;
  // Checkout SessionのURLを返す
  createCheckoutSession(
    input: OnboardingCheckoutSessionInput
  ): Promise<string | null>;
  // 金額の正はStripeのPriceのため、入会のメールに出す金額はCheckoutの明細から取る
  retrieveCheckoutCharge(
    stripeCheckoutSessionId: string
  ): Promise<OnboardingCharge>;
}
