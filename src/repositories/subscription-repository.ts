import type { MemberRankValue } from "@/domain/value-objects/member-rank";

// docs/db-schema-redesign.md「subscriptions」節のstatus CHECK制約に対応する。
// Stripe側にはこの他に'paused'が存在するが、現状のアプリケーションコードが
// 実際に扱う経路（チェックアウト完了時のオンボーディング確定）では発生しない
// ため未対応（発生した場合はtoSubscriptionStatusで例外になる）。
export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "unpaid"
  | "canceled"
  | "incomplete"
  | "incomplete_expired";

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

export type SubscriptionOwner =
  | { userId: string; organizationId?: undefined }
  | { userId?: undefined; organizationId: string };

export type UpsertSubscriptionInput = SubscriptionOwner &
  Omit<SubscriptionSnapshot, "id">;

export interface SubscriptionRepository {
  findActiveByUserId(userId: string): Promise<SubscriptionSnapshot | null>;
  findActiveByOrganizationId(
    organizationId: string
  ): Promise<SubscriptionSnapshot | null>;
  // 所有者（user_id/organization_idのどちらか一方）につき解約済みでない行は
  // 1件までという部分UNIQUE制約（subscriptions_user_active_idx等）を前提に、
  // 既存のアクティブな行があれば更新、無ければ新規作成する
  upsert(input: UpsertSubscriptionInput): Promise<void>;
}
