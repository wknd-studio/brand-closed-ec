import type { SubscriptionStatus } from "@/repositories/subscription-repository";

/** Stripe から取得したサブスクリプションのステータス・期間・開始日時 */
export type RetrievedSubscription = {
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  startedAt: Date;
};

export interface SubscriptionGateway {
  cancelSubscription(subscriptionId: string): Promise<void>;
  retrieveSubscription(subscriptionId: string): Promise<RetrievedSubscription>;
}
