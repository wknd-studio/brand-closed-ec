// subscriptions.status の値（Stripe の Subscription の status をそのまま写したもの）。
// docs/db-schema-redesign.md「subscriptions」節の status CHECK 制約に対応する。
// 値ごとの会員の扱いの正は docs/domain/subscription-billing.md「支払い失敗・Stripe側の解約」
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired";
