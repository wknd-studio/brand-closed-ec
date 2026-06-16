import { getStripe } from "@/lib/stripe";
import type { SubscriptionGateway } from "@/repositories/subscription-gateway";

export class StripeSubscriptionGateway implements SubscriptionGateway {
  async cancelSubscription(subscriptionId: string): Promise<void> {
    await getStripe().subscriptions.cancel(subscriptionId);
  }
}
