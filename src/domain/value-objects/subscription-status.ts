// subscriptions.status のCHECK制約と同じ値（Stripe の値をそのまま写したもの）
const SUBSCRIPTION_STATUS_VALUES = [
  "trialing",
  "active",
  "past_due",
  "unpaid",
  "canceled",
  "incomplete",
  "incomplete_expired",
] as const;

export type SubscriptionStatusValue =
  (typeof SUBSCRIPTION_STATUS_VALUES)[number];

// サブスクリプションの状態から、会員から見た状態を判定する（docs/domain/subscription-billing.md「支払い失敗・Stripe側の解約」）
export class SubscriptionStatus {
  private constructor(readonly value: SubscriptionStatusValue) {}

  static of(value: string): SubscriptionStatus {
    if (!(SUBSCRIPTION_STATUS_VALUES as readonly string[]).includes(value)) {
      throw new Error(`不正なSubscriptionStatus値: ${value}`);
    }
    return new SubscriptionStatus(value as SubscriptionStatusValue);
  }

  // 月額費用の支払い失敗中（Stripe が再請求している間）。unpaid は使わない設定だが、万一なった場合も同じ扱いにする
  isPaymentFailing(): boolean {
    return this.value === "past_due" || this.value === "unpaid";
  }
}
