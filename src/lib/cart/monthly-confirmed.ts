import { createAdminClient } from "@/lib/supabase/server-admin";
import { MONTHLY_LIMITS } from "@/lib/constants/membership";
import type { MemberRank } from "@/lib/sanity/products";

export type MonthlyUsageInfo = {
  confirmedAmount: number;
  monthlyLimit: number;
};

function getCurrentMonthPeriod(subscribedAt: string | null): {
  start: Date;
  end: Date;
} {
  const now = new Date();
  if (!subscribedAt) {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1),
    };
  }
  const day = new Date(subscribedAt).getDate();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), day);
  if (now >= startThisMonth) {
    return {
      start: startThisMonth,
      end: new Date(now.getFullYear(), now.getMonth() + 1, day),
    };
  }
  return {
    start: new Date(now.getFullYear(), now.getMonth() - 1, day),
    end: startThisMonth,
  };
}

export async function getMonthlyUsageInfo(
  clerkUserId: string
): Promise<MonthlyUsageInfo> {
  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id, rank, subscribed_at")
    .eq("clerk_user_id", clerkUserId)
    .single();

  if (!user) return { confirmedAmount: 0, monthlyLimit: 0 };

  const monthlyLimit = MONTHLY_LIMITS[user.rank as MemberRank] ?? 0;
  const { start, end } = getCurrentMonthPeriod(user.subscribed_at);

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
