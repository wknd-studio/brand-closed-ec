import type { SubscriptionStatusValue } from "@/domain/value-objects/subscription-status";

/** Stripe から取得したサブスクリプションのステータス・期間・開始日時・解約 */
export type RetrievedSubscription = {
  status: SubscriptionStatusValue;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  startedAt: Date;
  /** 期末での解約の予約 */
  cancelAtPeriodEnd: boolean;
  /** 解約が確定した（サブスクリプションが終了した）日時。終了していなければ null */
  canceledAt: Date | null;
};

export interface SubscriptionGateway {
  cancelSubscription(subscriptionId: string): Promise<void>;
  retrieveSubscription(subscriptionId: string): Promise<RetrievedSubscription>;
}
