import type { MemberRankValue } from "@/domain/value-objects/member-rank";
// Stripe側にはこの他に'paused'が存在するが、v1では起きないため未対応（発生した場合は
// toSubscriptionStatusで例外になる）
import type { SubscriptionStatusValue } from "@/domain/value-objects/subscription-status";

export type SubscriptionSnapshot = {
  id: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  stripeSubscriptionScheduleId: string | null;
  status: SubscriptionStatusValue;
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
  // 解約済み（SubscriptionStatus.isEnded()）でない行を返す
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
