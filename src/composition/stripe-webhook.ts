import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseStripeWebhookEventRepository } from "@/infrastructure/supabase/supabase-stripe-webhook-event-repository";
import { SentryErrorReporter } from "@/infrastructure/sentry/sentry-error-reporter";
import {
  processStripeWebhookEventOnce as processStripeWebhookEventOnceUseCase,
  type ProcessStripeWebhookEventOnceInput,
} from "@/use-cases/process-stripe-webhook-event-once";

export {
  constructStripeWebhookEvent,
  isPaidRank,
  retrieveOnboardingSubscription,
} from "@/infrastructure/stripe/stripe-webhook";
export type { ProcessStripeWebhookEventOnceResult } from "@/use-cases/process-stripe-webhook-event-once";

export function processStripeWebhookEventOnce(
  input: ProcessStripeWebhookEventOnceInput
) {
  return processStripeWebhookEventOnceUseCase(input, {
    webhookEventRepo: new SupabaseStripeWebhookEventRepository(
      createAdminClient()
    ),
    errorReporter: new SentryErrorReporter(),
  });
}
