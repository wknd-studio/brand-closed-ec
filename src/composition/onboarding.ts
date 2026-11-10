import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseSubscriptionOnboardingRepository } from "@/infrastructure/supabase/supabase-subscription-onboarding-repository";
import { ClerkAccountGateway } from "@/infrastructure/clerk/clerk-account-gateway";
import { StripeOnboardingCheckoutGateway } from "@/infrastructure/stripe/stripe-onboarding-checkout-gateway";
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
  completeSubscriptionOnboarding as completeSubscriptionOnboardingUseCase,
  type CompleteSubscriptionOnboardingInput,
} from "@/use-cases/complete-subscription-onboarding";

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

export function completeSubscriptionOnboarding(
  input: CompleteSubscriptionOnboardingInput
) {
  const supabase = createAdminClient();
  return completeSubscriptionOnboardingUseCase(input, {
    userRepo: new SupabaseUserRepository(supabase),
    onboardingRepo: new SupabaseSubscriptionOnboardingRepository(supabase),
    accountGateway: new ClerkAccountGateway(),
  });
}
