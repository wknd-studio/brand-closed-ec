import { getStripe } from "@/infrastructure/stripe/client";
import {
  toSubscriptionPeriod,
  toSubscriptionStatus,
} from "@/infrastructure/stripe/stripe-subscription-mapper";
import type {
  RetrievedSubscription,
  SubscriptionGateway,
} from "@/repositories/subscription-gateway";

export class StripeSubscriptionGateway implements SubscriptionGateway {
  async cancelSubscription(subscriptionId: string): Promise<void> {
    await getStripe().subscriptions.cancel(subscriptionId);
  }

  async retrieveSubscription(
    subscriptionId: string
  ): Promise<RetrievedSubscription> {
    const subscription =
      await getStripe().subscriptions.retrieve(subscriptionId);
    const { currentPeriodStart, currentPeriodEnd } =
      toSubscriptionPeriod(subscription);
    return {
      status: toSubscriptionStatus(subscription.status),
      currentPeriodStart,
      currentPeriodEnd,
      startedAt: new Date(subscription.start_date * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      // Stripeのcanceled_atは期末解約の予約時にも入るため、終了した日時のended_atを使う
      // （subscriptions.canceled_atは予約と確定を区別する。docs/db-schema-redesign.md）
      canceledAt: subscription.ended_at
        ? new Date(subscription.ended_at * 1000)
        : null,
    };
  }
}
