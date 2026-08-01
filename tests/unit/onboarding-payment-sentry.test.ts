import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@sentry/nextjs", () => ({
  captureException: vi.fn(),
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

import * as Sentry from "@sentry/nextjs";
import { auth, currentUser } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import OnboardingPaymentPage from "@/app/onboarding/payment/page";

describe("OnboardingPaymentPage - Sentry例外送信", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth).mockResolvedValue({ userId: "clerk-1" } as never);
    vi.mocked(currentUser).mockResolvedValue({
      emailAddresses: [{ emailAddress: "test@example.com" }],
    } as never);
  });

  it("Checkout Session作成失敗時にSentry.captureExceptionを呼ぶ", async () => {
    const error = new Error("Stripe API エラー");
    createCheckoutSessionMock.mockRejectedValue(error);

    await OnboardingPaymentPage({
      searchParams: Promise.resolve({ plan: "starter" }),
    });

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

    await expect(
      OnboardingPaymentPage({
        searchParams: Promise.resolve({ plan: "starter" }),
      })
    ).rejects.toThrow("NEXT_REDIRECT:/sign-in");

    expect(Sentry.captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({
        tags: expect.objectContaining({ page: "onboarding-payment" }),
      })
    );
    expect(redirect).toHaveBeenCalledWith("/sign-in");
    expect(createCheckoutSessionMock).not.toHaveBeenCalled();
  });
});
