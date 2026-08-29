import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  SubscriptionRepository,
  SubscriptionSnapshot,
  SubscriptionOwner,
  UpsertSubscriptionInput,
} from "@/repositories/subscription-repository";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";

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
    status: row.status as SubscriptionSnapshot["status"],
    rank: row.rank_code as MemberRankValue,
    pendingRank: row.pending_rank_code as MemberRankValue | null,
    currentPeriodStart: new Date(row.current_period_start),
    currentPeriodEnd: new Date(row.current_period_end),
    cancelAtPeriodEnd: row.cancel_at_period_end,
    canceledAt: row.canceled_at ? new Date(row.canceled_at) : null,
  };
}

const SELECT_FIELDS =
  "id, stripe_customer_id, stripe_subscription_id, stripe_subscription_schedule_id, status, rank_code, pending_rank_code, current_period_start, current_period_end, cancel_at_period_end, canceled_at";

export class SupabaseSubscriptionRepository implements SubscriptionRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  async findActiveByUserId(
    userId: string
  ): Promise<SubscriptionSnapshot | null> {
    const { data } = await this.db
      .from("subscriptions")
      .select(SELECT_FIELDS)
      .eq("user_id", userId)
      .neq("status", "canceled")
      .maybeSingle();
    return data ? toSnapshot(data as SubscriptionRow) : null;
  }

  async findActiveByOrganizationId(
    organizationId: string
  ): Promise<SubscriptionSnapshot | null> {
    const { data } = await this.db
      .from("subscriptions")
      .select(SELECT_FIELDS)
      .eq("organization_id", organizationId)
      .neq("status", "canceled")
      .maybeSingle();
    return data ? toSnapshot(data as SubscriptionRow) : null;
  }

  async upsert(input: UpsertSubscriptionInput): Promise<void> {
    const existing = await this.findExisting(input);

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
      await this.db.from("subscriptions").update(payload).eq("id", existing.id);
      return;
    }

    await this.db.from("subscriptions").insert({
      ...payload,
      user_id: input.userId ?? null,
      organization_id: input.organizationId ?? null,
    });
  }

  private async findExisting(
    owner: SubscriptionOwner
  ): Promise<SubscriptionSnapshot | null> {
    if (owner.userId !== undefined) {
      return this.findActiveByUserId(owner.userId);
    }
    return this.findActiveByOrganizationId(owner.organizationId);
  }
}
