import type Stripe from "stripe";
import type { SubscriptionStatus } from "@/repositories/subscription-repository";

// docs/db-schema-redesign.md「subscriptions」節のstatus CHECK制約に対応する。
// Stripe側の'paused'は現状アプリケーションコードが扱う経路
// （チェックアウト完了時のオンボーディング確定）では発生しないため未対応。
export function toSubscriptionStatus(
  status: Stripe.Subscription.Status
): SubscriptionStatus {
  if (status === "paused") {
    throw new Error(
      `未対応のStripe Subscriptionステータスです: ${status}（'paused'はsubscriptionsテーブルのCHECK制約に未追加）`
    );
  }
  return status;
}

// Stripe API 2025年以降、current_period_start/endはSubscriptionのルートから
// 削除され、Subscription Item（1商品=1価格のためitems.data[0]で確定できる）
// 側に移動している
export function toSubscriptionPeriod(subscription: Stripe.Subscription): {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
} {
  const item = subscription.items.data[0];
  if (!item) {
    throw new Error(`Subscriptionにitemsがありません: ${subscription.id}`);
  }
  return {
    currentPeriodStart: new Date(item.current_period_start * 1000),
    currentPeriodEnd: new Date(item.current_period_end * 1000),
  };
}
