export interface SubscriptionGateway {
  cancelSubscription(subscriptionId: string): Promise<void>;
}
