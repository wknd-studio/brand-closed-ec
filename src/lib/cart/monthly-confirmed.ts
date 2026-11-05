import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

export type MonthlyUsageInfo = {
  confirmedAmount: number;
  monthlyLimit: number;
};

export async function getMonthlyUsageInfo(
  clerkUserId: string
): Promise<MonthlyUsageInfo> {
  const supabase = createAdminClient();

  const user = await new SupabaseUserRepository(supabase).findByClerkUserId(
    clerkUserId
  );
  if (!user) return { confirmedAmount: 0, monthlyLimit: 0 };

  // 上限チェック（place_order_with_limit_check）と同じ集計ルールにするため、
  // 確定額はOrderRepositoryの集計をそのまま使う
  const confirmedAmount = await new SupabaseOrderRepository(
    supabase
  ).sumConfirmedAmountByUserId(
    user.id,
    MonthlyPeriod.fromBillingAnchorDay(user.billingAnchorDay)
  );

  return { confirmedAmount, monthlyLimit: user.rank.getMonthlyLimit().amount };
}
