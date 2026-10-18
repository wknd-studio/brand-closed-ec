import type { UserRepository } from "@/repositories/user-repository";
import type { OnboardingCheckoutGateway } from "@/repositories/onboarding-checkout-gateway";
import { resolveOnboardingCheckout } from "@/use-cases/resolve-onboarding-checkout";

export type StartOnboardingCheckoutResult =
  | { url: string | null }
  | { redirectTo: string };

export type StartOnboardingCheckoutInput = {
  clerkUserId: string;
  // Clerkのメールアドレス。取れなければselectPlanでusersに保存したものを使う
  email: string | undefined;
};

export type StartOnboardingCheckoutDeps = {
  userRepo: UserRepository;
  checkoutGateway: OnboardingCheckoutGateway;
};

/**
 * 入会時の決済（Checkout）を始める（GitHub issue #410）。決済は済んだが
 * Webhookがまだ届かずonboarding_completed=falseの間に、別のプランで再決済されて
 * サブスクリプションが2本できないよう、会員ごとに1つのStripe Customerを使い、
 * そのCustomerに有効なサブスクリプションがあれば新しいCheckoutを作らない
 */
export async function startOnboardingCheckout(
  input: StartOnboardingCheckoutInput,
  deps: StartOnboardingCheckoutDeps
): Promise<StartOnboardingCheckoutResult> {
  const { userRepo, checkoutGateway } = deps;
  const { clerkUserId } = input;

  const checkout = await resolveOnboardingCheckout(clerkUserId, { userRepo });
  if ("redirectTo" in checkout) return checkout;
  const { user, rank } = checkout;

  let stripeCustomerId = user.stripeCustomerId;
  if (!stripeCustomerId) {
    stripeCustomerId = await checkoutGateway.createCustomer({
      userId: user.id,
      clerkUserId,
      email: input.email ?? user.email,
    });
    // 保存できないままCheckoutを作ると、次回また別のCustomerで決済させてしまう
    await userRepo.saveStripeCustomerId(user.id, stripeCustomerId);
  } else if (await checkoutGateway.hasActiveSubscription(stripeCustomerId)) {
    // 決済済みで入会の確定（Webhook）を待っている
    return { redirectTo: "/onboarding/payment/success" };
  }

  const url = await checkoutGateway.createCheckoutSession({
    userId: user.id,
    clerkUserId,
    stripeCustomerId,
    rank,
  });
  return { url };
}
