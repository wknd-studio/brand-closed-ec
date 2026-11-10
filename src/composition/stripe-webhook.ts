import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseStripeWebhookEventRepository } from "@/infrastructure/supabase/supabase-stripe-webhook-event-repository";

export {
  constructStripeWebhookEvent,
  isPaidRank,
  retrieveOnboardingSubscription,
} from "@/infrastructure/stripe/stripe-webhook";
export type { StripeWebhookEventClaimResult } from "@/repositories/stripe-webhook-event-repository";

// stripe_webhook_eventsによるイベントの冪等性（claim → markProcessed / markFailed）。
// 1つのイベントの処理の間、同じインスタンスを使う
export function stripeWebhookEvents() {
  return new SupabaseStripeWebhookEventRepository(createAdminClient());
}
