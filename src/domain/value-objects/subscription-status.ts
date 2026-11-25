// subscriptions.status の値（Stripe の Subscription の status をそのまま写したもの）。
// docs/db-schema-redesign.md「subscriptions」節の status CHECK 制約に対応する。
// 値ごとの会員の扱いの正は docs/domain/subscription-billing.md「支払い失敗・Stripe側の解約」
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

// 解約済みで、以後の請求も利用も無い状態（docs/domain/membership.md「Stripe側の解約による
// 利用停止」）。past_due 等の再請求中の状態と、初回の支払い待ちの incomplete は含めない。
// subscriptions_user_active_idx（部分UNIQUEインデックス）も同じ状態を除外する
const ENDED_STATUSES: readonly SubscriptionStatusValue[] = [
  "canceled",
  "incomplete_expired",
];

export class SubscriptionStatus {
  private constructor(readonly value: SubscriptionStatusValue) {}

  static of(value: string): SubscriptionStatus {
    if (!(SUBSCRIPTION_STATUS_VALUES as readonly string[]).includes(value)) {
      throw new Error(`不正なSubscriptionStatus値: ${value}`);
    }
    return new SubscriptionStatus(value as SubscriptionStatusValue);
  }

  /** 解約済みの状態の一覧。repository のクエリで解約済みの行を除く条件に使う */
  static endedValues(): readonly SubscriptionStatusValue[] {
    return ENDED_STATUSES;
  }

  isEnded(): boolean {
    return ENDED_STATUSES.includes(this.value);
  }
}
