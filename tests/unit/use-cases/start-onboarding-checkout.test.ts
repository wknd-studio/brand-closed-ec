import { describe, it, expect, vi } from "vitest";
import { startOnboardingCheckout } from "@/use-cases/start-onboarding-checkout";
import type { OnboardingCheckoutGateway } from "@/repositories/onboarding-checkout-gateway";
import { makeUserRepo, makeUser } from "./helpers";

const USER_ID = "00000000-0000-0000-0000-000000000001";
const INPUT = { clerkUserId: "clerk-1", email: "clerk@example.com" };
const CHECKOUT_URL = "https://checkout.stripe.com/c/pay/cs_1";

function makeCheckoutGateway(): OnboardingCheckoutGateway {
  return {
    createCustomer: vi.fn().mockResolvedValue("cus_new"),
    hasActiveSubscription: vi.fn().mockResolvedValue(false),
    createCheckoutSession: vi.fn().mockResolvedValue(CHECKOUT_URL),
  };
}

function setup(stripeCustomerId: string | null) {
  const userRepo = makeUserRepo();
  vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(
    makeUser({ rank: "premium", onboardingCompleted: false }).with({
      stripeCustomerId,
    })
  );
  const checkoutGateway = makeCheckoutGateway();
  return { userRepo, checkoutGateway };
}

describe("startOnboardingCheckout", () => {
  it("Stripe Customerが未作成の場合: 作成してusersに保存し、そのCustomerでCheckoutを作る", async () => {
    const deps = setup(null);

    const result = await startOnboardingCheckout(INPUT, deps);

    expect(deps.checkoutGateway.createCustomer).toHaveBeenCalledWith({
      userId: USER_ID,
      clerkUserId: "clerk-1",
      email: "clerk@example.com",
    });
    expect(deps.userRepo.saveStripeCustomerId).toHaveBeenCalledWith(
      USER_ID,
      "cus_new"
    );
    expect(deps.checkoutGateway.createCheckoutSession).toHaveBeenCalledWith({
      userId: USER_ID,
      clerkUserId: "clerk-1",
      stripeCustomerId: "cus_new",
      rank: "premium",
    });
    expect(result).toEqual({ url: CHECKOUT_URL });
  });

  it("Clerkのメールアドレスが取れない場合: usersに保存したメールアドレスでCustomerを作る", async () => {
    const deps = setup(null);

    await startOnboardingCheckout(
      { clerkUserId: "clerk-1", email: undefined },
      deps
    );

    expect(deps.checkoutGateway.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ email: "test@example.com" })
    );
  });

  it("Stripe Customerが保存済みの場合: 新しく作らず、同じCustomerでCheckoutを作る", async () => {
    const deps = setup("cus_existing");

    const result = await startOnboardingCheckout(INPUT, deps);

    expect(deps.checkoutGateway.createCustomer).not.toHaveBeenCalled();
    expect(deps.userRepo.saveStripeCustomerId).not.toHaveBeenCalled();
    expect(deps.checkoutGateway.hasActiveSubscription).toHaveBeenCalledWith(
      "cus_existing"
    );
    expect(deps.checkoutGateway.createCheckoutSession).toHaveBeenCalledWith(
      expect.objectContaining({ stripeCustomerId: "cus_existing" })
    );
    expect(result).toEqual({ url: CHECKOUT_URL });
  });

  it("有効なサブスクリプションが既にある場合: Checkoutを作らず決済完了画面へ案内する", async () => {
    const deps = setup("cus_existing");
    vi.mocked(deps.checkoutGateway.hasActiveSubscription).mockResolvedValue(
      true
    );

    const result = await startOnboardingCheckout(INPUT, deps);

    expect(deps.checkoutGateway.createCheckoutSession).not.toHaveBeenCalled();
    expect(result).toEqual({ redirectTo: "/onboarding/payment/success" });
  });

  it("登録内容が決済できない状態の場合: Stripeを呼ばず種別選択へ戻す", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const checkoutGateway = makeCheckoutGateway();

    const result = await startOnboardingCheckout(INPUT, {
      userRepo,
      checkoutGateway,
    });

    expect(checkoutGateway.createCustomer).not.toHaveBeenCalled();
    expect(checkoutGateway.createCheckoutSession).not.toHaveBeenCalled();
    expect(result).toEqual({ redirectTo: "/onboarding/account-type" });
  });

  it("Customerの保存に失敗した場合: Checkoutを作らず例外にする", async () => {
    const deps = setup(null);
    vi.mocked(deps.userRepo.saveStripeCustomerId).mockRejectedValue(
      new Error("db error")
    );

    await expect(startOnboardingCheckout(INPUT, deps)).rejects.toThrow(
      "db error"
    );
    expect(deps.checkoutGateway.createCheckoutSession).not.toHaveBeenCalled();
  });
});
