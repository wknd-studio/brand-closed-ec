import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
  setUser: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
  currentUser: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));

const createCheckoutSessionMock = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({
    checkout: { sessions: { create: createCheckoutSessionMock } },
  }),
  STRIPE_PRICE_IDS: {
    starter: { monthly: "price_monthly", initialFee: "price_initial" },
  },
}));

vi.mock("@/lib/supabase/server-admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/use-cases/resolve-onboarding-checkout", () => ({
  resolveOnboardingCheckout: vi.fn(),
}));

import * as Sentry from "@sentry/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { resolveOnboardingCheckout } from "@/use-cases/resolve-onboarding-checkout";
import OnboardingPaymentPage from "@/app/onboarding/payment/page";

describe("OnboardingPaymentPage - Sentry例外送信", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ userId: "clerk-1" } as never);
    vi.mocked(currentUser).mockResolvedValue({
      emailAddresses: [{ emailAddress: "test@example.com" }],
    } as never);
    vi.mocked(resolveOnboardingCheckout).mockResolvedValue({
      userId: "user-1",
      rank: "starter",
    });
  });

  it("Checkout Session作成失敗時にSentry.captureExceptionを呼ぶ", async () => {
    const error = new Error("Stripe API エラー");
    createCheckoutSessionMock.mockRejectedValue(error);

    await OnboardingPaymentPage();

    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ page: "onboarding-payment" }),
      })
    );
  });

  it("currentUser()が404で失敗した場合、Sentryに送信した上で/sign-inへリダイレクトする（有効なセッションだがClerk上のUserが見つからないケース）", async () => {
    const error = new Error("ClerkAPIResponseError: Not Found");
    vi.mocked(currentUser).mockRejectedValue(error);

    await expect(OnboardingPaymentPage()).rejects.toThrow(
      "NEXT_REDIRECT:/sign-in"
    );

    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ page: "onboarding-payment" }),
      })
    );
    expect(redirect).toHaveBeenCalledWith("/sign-in");
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("登録内容が揃っていない場合、Checkout Sessionを作らずに戻り先へリダイレクトする", async () => {
    vi.mocked(resolveOnboardingCheckout).mockResolvedValue({
      redirectTo: "/onboarding/account-type",
    });

    await expect(OnboardingPaymentPage()).rejects.toThrow(
      "NEXT_REDIRECT:/onboarding/account-type"
    );

    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });

  it("Checkout Session作成にusersの行・ランクベースのidempotencyKeyを付与し、価格・metadataをDBのランクから決める", async () => {
    createCheckoutSessionMock.mockResolvedValue({
      url: "https://checkout.stripe.com/cs_1",
    });

    await expect(OnboardingPaymentPage()).rejects.toThrow(
      "NEXT_REDIRECT:https://checkout.stripe.com/cs_1"
    );

    expect(createCheckoutSessionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          { price: "price_monthly", quantity: 1 },
          { price: "price_initial", quantity: 1 },
        ],
        metadata: { clerk_user_id: "clerk-1", plan: "starter" },
      }),
      { idempotencyKey: "onboarding-checkout-session-user-1-starter" }
    );
  });
});
