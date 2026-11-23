import { createServerClient } from "@/infrastructure/supabase/server";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { StripeBillingPortalGateway } from "@/infrastructure/stripe/stripe-billing-portal-gateway";
import {
  startBillingPortalSession as startBillingPortalSessionUseCase,
  type StartBillingPortalSessionInput,
} from "@/use-cases/start-billing-portal-session";

// users の読み取りだけのため、ログイン中の会員のトークンで RLS を効かせたクライアントを使う
export async function startBillingPortalSession(
  input: StartBillingPortalSessionInput
) {
  return startBillingPortalSessionUseCase(input, {
    userRepo: new SupabaseUserRepository(await createServerClient()),
    billingPortalGateway: new StripeBillingPortalGateway(),
  });
}
