import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseSubscriptionOnboardingRepository } from "@/infrastructure/supabase/supabase-subscription-onboarding-repository";
import { ClerkAccountGateway } from "@/infrastructure/clerk/clerk-account-gateway";
import { SupabaseStripeWebhookEventRepository } from "@/infrastructure/supabase/supabase-stripe-webhook-event-repository";
import { StripeOnboardingCheckoutGateway } from "@/infrastructure/stripe/stripe-onboarding-checkout-gateway";
import { StripeSubscriptionGateway } from "@/infrastructure/stripe/stripe-subscription-gateway";
import { SentryErrorReporter } from "@/infrastructure/sentry/sentry-error-reporter";
import {
  createUser as createUserUseCase,
  type CreateUserInput,
} from "@/use-cases/create-user";
import {
  selectPlan as selectPlanUseCase,
  type SelectPlanInput,
} from "@/use-cases/select-plan";
import {
  startOnboardingCheckout as startOnboardingCheckoutUseCase,
  type StartOnboardingCheckoutInput,
} from "@/use-cases/start-onboarding-checkout";
import {
  completeOnboardingCheckout as completeOnboardingCheckoutUseCase,
  type CompleteOnboardingCheckoutInput,
} from "@/use-cases/complete-onboarding-checkout";

export type { StartOnboardingCheckoutResult } from "@/use-cases/start-onboarding-checkout";

export function createUser(input: CreateUserInput) {
  return createUserUseCase(input, {
    userRepo: new SupabaseUserRepository(createAdminClient()),
    accountGateway: new ClerkAccountGateway(),
  });
}

export function selectPlan(input: SelectPlanInput) {
  return selectPlanUseCase(input, {
    userRepo: new SupabaseUserRepository(createAdminClient()),
    accountGateway: new ClerkAccountGateway(),
  });
}

export function startOnboardingCheckout(input: StartOnboardingCheckoutInput) {
  return startOnboardingCheckoutUseCase(input, {
    userRepo: new SupabaseUserRepository(createAdminClient()),
    checkoutGateway: new StripeOnboardingCheckoutGateway(),
  });
}

export function completeOnboardingCheckout(
  input: CompleteOnboardingCheckoutInput
) {
  const supabase = createAdminClient();
  return completeOnboardingCheckoutUseCase(input, {
    webhookEventRepo: new SupabaseStripeWebhookEventRepository(supabase),
    userRepo: new SupabaseUserRepository(supabase),
    onboardingRepo: new SupabaseSubscriptionOnboardingRepository(supabase),
    subscriptionGateway: new StripeSubscriptionGateway(),
    accountGateway: new ClerkAccountGateway(),
    errorReporter: new SentryErrorReporter(),
  });
}
