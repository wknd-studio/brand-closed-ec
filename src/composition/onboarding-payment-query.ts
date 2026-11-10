import { StripeOnboardingCheckoutGateway } from "@/infrastructure/stripe/stripe-onboarding-checkout-gateway";
import { StripeOnboardingPaymentQueryService } from "@/infrastructure/stripe/stripe-onboarding-payment-query-service";
import { createServerClient } from "@/infrastructure/supabase/server";
import { SupabaseMemberQueryService } from "@/infrastructure/supabase/supabase-member-query-service";
import type { OnboardingPaymentQueryService } from "@/queries/onboarding-payment-query-service";

// 会員の Stripe Customer は、ログイン中の会員のトークンで RLS を効かせたクライアントで読む
export async function onboardingPaymentQueryService(): Promise<OnboardingPaymentQueryService> {
  return new StripeOnboardingPaymentQueryService(
    new SupabaseMemberQueryService(await createServerClient()),
    new StripeOnboardingCheckoutGateway()
  );
}
