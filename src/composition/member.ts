import { createAdminClient } from "@/infrastructure/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseSubscriptionRepository } from "@/infrastructure/supabase/supabase-subscription-repository";
import { StripeSubscriptionGateway } from "@/infrastructure/stripe/stripe-subscription-gateway";
import { ClerkAccountGateway } from "@/infrastructure/clerk/clerk-account-gateway";
import { SentryErrorReporter } from "@/infrastructure/sentry/sentry-error-reporter";
import {
  withdraw as withdrawUseCase,
  type WithdrawInput,
} from "@/use-cases/withdraw";

export function withdraw(input: WithdrawInput) {
  const supabase = createAdminClient();
  return withdrawUseCase(input, {
    userRepo: new SupabaseUserRepository(supabase),
    orderRepo: new SupabaseOrderRepository(supabase),
    subscriptionRepo: new SupabaseSubscriptionRepository(supabase),
    subscriptionGateway: new StripeSubscriptionGateway(),
    accountGateway: new ClerkAccountGateway(),
    errorReporter: new SentryErrorReporter(),
  });
}

// Clerk Webhook（user.deleted）で、退会処理を通らずに消えた会員がいるかを確かめるのに使う
export function findMemberByClerkUserId(clerkUserId: string) {
  return new SupabaseUserRepository(createAdminClient()).findByClerkUserId(
    clerkUserId
  );
}
