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
import {
  detectMemberDeletedWithoutWithdrawal as detectMemberDeletedWithoutWithdrawalUseCase,
  type DetectMemberDeletedWithoutWithdrawalInput,
} from "@/use-cases/detect-member-deleted-without-withdrawal";

// 退会で deleted_at を入れた後の取り消し（cancelWithdrawal）は会員のクライアントでは書けないため admin（architecture.md）
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

export function detectMemberDeletedWithoutWithdrawal(
  input: DetectMemberDeletedWithoutWithdrawalInput
) {
  return detectMemberDeletedWithoutWithdrawalUseCase(input, {
    userRepo: new SupabaseUserRepository(createAdminClient()),
    errorReporter: new SentryErrorReporter(),
  });
}
