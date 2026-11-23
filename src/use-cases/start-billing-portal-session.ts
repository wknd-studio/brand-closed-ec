import type { UserRepository } from "@/repositories/user-repository";
import type { BillingPortalGateway } from "@/repositories/billing-portal-gateway";

export type StartBillingPortalSessionInput = {
  // ログイン中の会員。画面から送られた Customer ID は使わず、この会員の Customer だけで Session を作る
  clerkUserId: string;
};

export type StartBillingPortalSessionDeps = {
  userRepo: UserRepository;
  billingPortalGateway: BillingPortalGateway;
};

/**
 * お支払い方法（カード）を変更する Stripe Billing Portal を開く（GitHub issue #216）。
 * Stripe Customer が無い会員（入会前）・見つからない会員は、Session を作らずに url: null を返す
 */
export async function startBillingPortalSession(
  input: StartBillingPortalSessionInput,
  deps: StartBillingPortalSessionDeps
): Promise<{ url: string | null }> {
  const user = await deps.userRepo.findByClerkUserId(input.clerkUserId);
  if (!user?.stripeCustomerId) return { url: null };

  const url = await deps.billingPortalGateway.createBillingPortalSession(
    user.stripeCustomerId
  );
  return { url };
}
