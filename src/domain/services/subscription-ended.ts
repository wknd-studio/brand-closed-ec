import { SubscriptionStatus } from "@/domain/value-objects/subscription-status";

/**
 * 入会済みで、解約済みでないサブスクリプションが1つも無ければ利用停止とする（docs/domain/membership.md
 * 「Stripe側の解約による利用停止」）。どの状態が解約済みかは SubscriptionStatus.isEnded() が決める。
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
    SubscriptionStatus.of(status).isEnded()
  );
}
