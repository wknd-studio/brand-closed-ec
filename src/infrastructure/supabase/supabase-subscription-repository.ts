import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  SubscriptionRepository,
  SubscriptionSnapshot,
  SubscriptionStatusSync,
  UpsertSubscriptionInput,
} from "@/repositories/subscription-repository";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { SubscriptionStatus } from "@/domain/value-objects/subscription-status";

type SubscriptionRow = {
  id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  stripe_subscription_schedule_id: string | null;
  status: string;
  rank_code: string;
  pending_rank_code: string | null;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
};

function toSnapshot(row: SubscriptionRow): SubscriptionSnapshot {
  return {
    id: row.id,
    stripeCustomerId: row.stripe_customer_id,
    stripeSubscriptionId: row.stripe_subscription_id,
    stripeSubscriptionScheduleId: row.stripe_subscription_schedule_id,
    status: SubscriptionStatus.of(row.status).value,
    rank: row.rank_code as MemberRankValue,
    pendingRank: row.pending_rank_code as MemberRankValue | null,
    currentPeriodStart: new Date(row.current_period_start),
    currentPeriodEnd: new Date(row.current_period_end),
    cancelAtPeriodEnd: row.cancel_at_period_end,
    canceledAt: row.canceled_at ? new Date(row.canceled_at) : null,
  };
}

// PostgREST の in 演算子の値の一覧
const ENDED_STATUSES_FILTER = `(${SubscriptionStatus.endedValues().join(",")})`;

const SELECT_FIELDS =
  "id, stripe_customer_id, stripe_subscription_id, stripe_subscription_schedule_id, status, rank_code, pending_rank_code, current_period_start, current_period_end, cancel_at_period_end, canceled_at";

export class SupabaseSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findActiveByUserId(
    userId: string
  ): Promise<SubscriptionSnapshot | null> {
    const { data, error } = await this.db
      .from("subscriptions")
      .select(SELECT_FIELDS)
      .eq("user_id", userId)
      // 解約済みでない行は会員につき1件まで（subscriptions_user_active_idx）
      .not("status", "in", ENDED_STATUSES_FILTER)
      .maybeSingle();
    if (error) throw error;
    return data ? toSnapshot(data as SubscriptionRow) : null;
  }

  async upsert(input: UpsertSubscriptionInput): Promise<void> {
    const existing = await this.findActiveByUserId(input.userId);

    const payload = {
      stripe_customer_id: input.stripeCustomerId,
      stripe_subscription_id: input.stripeSubscriptionId,
      stripe_subscription_schedule_id: input.stripeSubscriptionScheduleId,
      status: input.status,
      rank_code: input.rank,
      pending_rank_code: input.pendingRank,
      current_period_start: input.currentPeriodStart.toISOString(),
      current_period_end: input.currentPeriodEnd.toISOString(),
      cancel_at_period_end: input.cancelAtPeriodEnd,
      canceled_at: input.canceledAt?.toISOString() ?? null,
    };

    if (existing) {
      const { error } = await this.db
        .from("subscriptions")
        .update(payload)
        .eq("id", existing.id);
      if (error) throw error;
      return;
    }

    const { error } = await this.db.from("subscriptions").insert({
      ...payload,
      user_id: input.userId,
    });
    if (error) throw error;
  }

  async syncStatusByStripeSubscriptionId(
    stripeSubscriptionId: string,
    sync: SubscriptionStatusSync
  ): Promise<"updated" | "not_found"> {
    const { data, error } = await this.db
      .from("subscriptions")
      .update({
        status: sync.status,
        current_period_start: sync.currentPeriodStart.toISOString(),
        current_period_end: sync.currentPeriodEnd.toISOString(),
        cancel_at_period_end: sync.cancelAtPeriodEnd,
        canceled_at: sync.canceledAt?.toISOString() ?? null,
      })
      .eq("stripe_subscription_id", stripeSubscriptionId)
      .select("id");
    if (error) throw error;
    return data.length > 0 ? "updated" : "not_found";
  }
}
