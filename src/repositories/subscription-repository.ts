import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import type { SubscriptionStatus } from "@/domain/value-objects/subscription-status";

// 値の定義は domain に置く（新規注文を止める条件などの判定に使うため）。Stripe側には
// この他に'paused'が存在するが、v1では起きないため未対応（発生した場合は
// toSubscriptionStatusで例外になる）
export type { SubscriptionStatus };

export type SubscriptionSnapshot = {
  id: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeSubscriptionScheduleId: string | null;
  status: SubscriptionStatus;
  rank: MemberRankValue;
  pendingRank: MemberRankValue | null;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
};

export type UpsertSubscriptionInput = { userId: string } & Omit<
  SubscriptionSnapshot,
  "id"
>;

/** Stripe から取り直したサブスクリプションの状態。ランク（価格）は含めない（プラン変更の確定は #209） */
export type SubscriptionStatusSync = Pick<
  SubscriptionSnapshot,
  | "status"
  | "currentPeriodStart"
  | "currentPeriodEnd"
  | "cancelAtPeriodEnd"
  | "canceledAt"
>;

export interface SubscriptionRepository {
  findActiveByUserId(userId: string): Promise<SubscriptionSnapshot | null>;
  // user_idにつき解約済みでない行は1件までという部分UNIQUE制約
  // （subscriptions_user_active_idx）を前提に、既存のアクティブな行があれば
  // 更新、無ければ新規作成する
  upsert(input: UpsertSubscriptionInput): Promise<void>;
  // 解約済みの行も対象にするため、user_idではなくStripeのサブスクリプションIDで探す。
  // 該当する行が無ければ何もせず not_found を返す
  syncStatusByStripeSubscriptionId(
    stripeSubscriptionId: string,
    sync: SubscriptionStatusSync
  ): Promise<"updated" | "not_found">;
}
