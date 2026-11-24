import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import type { SubscriptionStatusValue } from "@/domain/value-objects/subscription-status";

// 値の一覧の正は domain の SubscriptionStatus（subscriptions.status の CHECK 制約に対応する）。
// Stripe側にはこの他に'paused'が存在するが、現状のアプリケーションコードが
// 実際に扱う経路（チェックアウト完了時のオンボーディング確定）では発生しない
// ため未対応（発生した場合はtoSubscriptionStatusで例外になる）。
export type SubscriptionStatus = SubscriptionStatusValue;

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
