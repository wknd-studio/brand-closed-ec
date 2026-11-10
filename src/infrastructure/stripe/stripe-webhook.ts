import type Stripe from "stripe";
import {
  getStripe,
  STRIPE_PRICE_IDS,
  type PaidRank,
} from "@/infrastructure/stripe/client";
import {
  toSubscriptionPeriod,
  toSubscriptionStatus,
} from "@/infrastructure/stripe/stripe-subscription-mapper";

// 署名が不正なら Stripe のエラーをそのまま投げる
export function constructStripeWebhookEvent(
  body: string,
  signature: string,
  secret: string
): Stripe.Event {
  return getStripe().webhooks.constructEvent(body, signature, secret);
}

// 入会のCheckoutはセルフサービスのランク（STRIPE_PRICE_IDSのキー）でしか作らない
export function isPaidRank(plan: string): plan is PaidRank {
  return Object.hasOwn(STRIPE_PRICE_IDS, plan);
}

// 入会の確定（completeSubscriptionOnboarding）に渡すステータス・期間・開始日
export async function retrieveOnboardingSubscription(
  stripeSubscriptionId: string
) {
  const subscription =
    await getStripe().subscriptions.retrieve(stripeSubscriptionId);
  const { currentPeriodStart, currentPeriodEnd } =
    toSubscriptionPeriod(subscription);
  return {
    status: toSubscriptionStatus(subscription.status),
    currentPeriodStart,
    currentPeriodEnd,
    subscriptionStartedAt: new Date(subscription.start_date * 1000),
  };
}
