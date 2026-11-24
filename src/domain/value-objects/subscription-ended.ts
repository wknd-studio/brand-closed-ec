// 解約済みで、以後の請求も利用も無いサブスクリプションの状態（docs/domain/membership.md
// 「Stripe側の解約による利用停止」）。past_due 等の再請求中の状態は含めない
const ENDED_SUBSCRIPTION_STATUSES = new Set(["canceled", "incomplete_expired"]);

/**
 * 入会済みで、解約済みでないサブスクリプションが1つも無ければ利用停止とする。
 * 入会前かどうかはサブスクリプションの有無では判定しない（入会前は行が無いのが正常なため）
 */
export function isSubscriptionEnded({
  onboardingCompleted,
  subscriptionStatuses,
}: {
  onboardingCompleted: boolean;
  subscriptionStatuses: readonly string[];
}): boolean {
  if (!onboardingCompleted) return false;
  return subscriptionStatuses.every((status) =>
    ENDED_SUBSCRIPTION_STATUSES.has(status)
  );
}
