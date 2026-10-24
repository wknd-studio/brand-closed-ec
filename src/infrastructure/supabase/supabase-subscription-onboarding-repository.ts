import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import type {
  ConfirmSubscriptionOnboardingInput,
  ConfirmSubscriptionOnboardingResult,
  SubscriptionOnboardingRepository,
} from "@/repositories/subscription-onboarding-repository";

export class SupabaseSubscriptionOnboardingRepository implements SubscriptionOnboardingRepository {
  constructor(private readonly db: SupabaseClient<Database>) {}

  // supabase-jsではトランザクションを張れないため、
  // confirm_subscription_onboarding関数（1回の呼び出し＝1トランザクション）で行う
  async confirm(
    input: ConfirmSubscriptionOnboardingInput
  ): Promise<ConfirmSubscriptionOnboardingResult> {
    const { data, error } = await this.db.rpc(
      "confirm_subscription_onboarding",
      {
        p_user_id: input.userId,
        p_rank_code: input.rank,
        p_stripe_customer_id: input.stripeCustomerId,
        p_stripe_subscription_id: input.stripeSubscriptionId,
        p_status: input.status,
        p_current_period_start: input.currentPeriodStart.toISOString(),
        p_current_period_end: input.currentPeriodEnd.toISOString(),
        p_billing_anchor_day: input.billingAnchorDay,
      }
    );
    if (error) throw error;
    return data as ConfirmSubscriptionOnboardingResult;
  }
}
