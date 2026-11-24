import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseStripeWebhookEventRepository } from "@/infrastructure/supabase/supabase-stripe-webhook-event-repository";
import { SupabaseSubscriptionRepository } from "@/infrastructure/supabase/supabase-subscription-repository";
import { StripeSubscriptionGateway } from "@/infrastructure/stripe/stripe-subscription-gateway";
import { SentryErrorReporter } from "@/infrastructure/sentry/sentry-error-reporter";
import {
  syncSubscriptionStatus as syncSubscriptionStatusUseCase,
  type SyncSubscriptionStatusInput,
} from "@/use-cases/sync-subscription-status";

// Webhook（customer.subscription.updated / deleted）から subscriptions を書き込むため admin
export function syncSubscriptionStatus(input: SyncSubscriptionStatusInput) {
  const supabase = createAdminClient();
  return syncSubscriptionStatusUseCase(input, {
    webhookEventRepo: new SupabaseStripeWebhookEventRepository(supabase),
    errorReporter: new SentryErrorReporter(),
    subscriptionGateway: new StripeSubscriptionGateway(),
    subscriptionRepo: new SupabaseSubscriptionRepository(supabase),
  });
}
