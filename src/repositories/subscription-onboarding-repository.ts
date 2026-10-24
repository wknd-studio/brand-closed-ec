import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import type { SubscriptionStatus } from "@/repositories/subscription-repository";

export type ConfirmSubscriptionOnboardingInput = {
  userId: string;
  rank: MemberRankValue;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  billingAnchorDay: number;
};

export interface SubscriptionOnboardingRepository {
  // usersの入会時の項目・subscriptionsの作成・ランク変更の記録（rank_code・
  // initial_fee_paid_rank_code・rank_changes）を1トランザクションで行う。
  // 同じstripeSubscriptionIdで確定済みなら何もしない（Webhook再配信の冪等性）
  confirm(input: ConfirmSubscriptionOnboardingInput): Promise<void>;
}
