import { createAdminClient } from "@/lib/supabase/server-admin";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

export type MonthlyUsageInfo = {
  confirmedAmount: number;
  monthlyLimit: number;
};

export async function getMonthlyUsageInfo(
  clerkUserId: string
): Promise<MonthlyUsageInfo> {
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id, rank_code, billing_anchor_day")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (!user) return { confirmedAmount: 0, monthlyLimit: 0 };

  const monthlyLimit = MemberRank.of(user.rank_code).getMonthlyLimit().amount;
  const { start, end } = MonthlyPeriod.fromBillingAnchorDay(
    user.billing_anchor_day
  );

  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .gte("created_at", start.toISOString())
    .lt("created_at", end.toISOString());

  const orderIds = orders?.map((o) => o.id) ?? [];

  if (orderIds.length === 0) {
    return { confirmedAmount: 0, monthlyLimit };
  }

  const { data: items } = await supabase
    .from("order_items")
    .select("unit_price_snapshot, quantity")
    .in("order_id", orderIds)
    .not("unit_price_snapshot", "is", null);

  const confirmedAmount = (items ?? []).reduce(
    (sum, item) => sum + (item.unit_price_snapshot ?? 0) * item.quantity,
    0
  );

  return { confirmedAmount, monthlyLimit };
}
