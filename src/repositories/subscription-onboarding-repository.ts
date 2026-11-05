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

/**
 * 入会の確定の結果。
 * - `confirmed`: 確定した
 * - `already_confirmed`: 同じstripeSubscriptionIdで確定済みのため何もしなかった（Webhook再配信）
 * - `conflicting_subscription`: 入会済み、または別のサブスクリプションが記録済みの会員、
 *   または同じstripeSubscriptionIdが別の会員で記録済みのため何もしなかった。課金済みのため、
 *   呼び出し側で運営者に知らせる
 * - `member_not_found`: 有効な会員（退会済みでないusers行）が無いため何もしなかった。
 *   課金済みのため、呼び出し側で運営者に知らせる
 */
export type ConfirmSubscriptionOnboardingResult =
  | "confirmed"
  | "already_confirmed"
  | "conflicting_subscription"
  | "member_not_found";

export interface SubscriptionOnboardingRepository {
  // usersの入会時の項目・subscriptionsの作成・ランク変更の記録（rank_code・
  // initial_fee_paid_rank_code・rank_changes）を1トランザクションで行う
  confirm(
    input: ConfirmSubscriptionOnboardingInput
  ): Promise<ConfirmSubscriptionOnboardingResult>;
}
