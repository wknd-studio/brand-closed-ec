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
    };
  }
}
