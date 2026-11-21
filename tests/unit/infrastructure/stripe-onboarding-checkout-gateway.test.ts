import { describe, it, expect, vi, beforeEach } from "vitest";

const createCustomerMock = vi.fn();
const listSubscriptionsMock = vi.fn();
const createCheckoutSessionMock = vi.fn();

vi.mock("@/infrastructure/stripe/client", () => ({
  getStripe: () => ({
    customers: { create: createCustomerMock },
    subscriptions: { list: listSubscriptionsMock },
    checkout: { sessions: { create: createCheckoutSessionMock } },
  }),
  STRIPE_PRICE_IDS: {
    premium: { monthly: "price_premium", initialFee: "price_premium_fee" },
  },
}));

import { StripeOnboardingCheckoutGateway } from "@/infrastructure/stripe/stripe-onboarding-checkout-gateway";

const USER_ID = "00000000-0000-0000-0000-000000000001";

function subscriptions(...statuses: string[]) {
  return { data: statuses.map((status, i) => ({ id: `sub_${i}`, status })) };
}

describe("StripeOnboardingCheckoutGateway", () => {
  const gateway = new StripeOnboardingCheckoutGateway();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  });

  describe("createCustomer()", () => {
    it("請求書の宛名と会員を特定できるmetadataを付けて作る", async () => {
      createCustomerMock.mockResolvedValue({ id: "cus_1" });

      const id = await gateway.createCustomer({
        userId: USER_ID,
        clerkUserId: "clerk-1",
        email: "test@example.com",
        name: "テスト株式会社",
      });

      expect(id).toBe("cus_1");
      expect(createCustomerMock).toHaveBeenCalledWith(
        {
          email: "test@example.com",
          name: "テスト株式会社",
          metadata: { supabase_user_id: USER_ID, clerk_user_id: "clerk-1" },
        },
        {
          idempotencyKey: expect.stringMatching(
            new RegExp(`^onboarding-customer-${USER_ID}-[0-9a-f]{64}$`)
          ),
        }
      );
    });

    it("同じ会員・同じ宛名なら同じ冪等キー、宛名が変われば別の冪等キーで作る", async () => {
      createCustomerMock.mockResolvedValue({ id: "cus_1" });
      const input = {
        userId: USER_ID,
        clerkUserId: "clerk-1",
        email: "test@example.com",
      };

      await gateway.createCustomer({ ...input, name: "テスト株式会社" });
      await gateway.createCustomer({ ...input, name: "テスト株式会社" });
      await gateway.createCustomer({ ...input, name: "別名株式会社" });

      const keys = createCustomerMock.mock.calls.map(
        ([, options]) => options.idempotencyKey
      );
      expect(keys[0]).toBe(keys[1]);
      expect(keys[2]).not.toBe(keys[0]);
    });
  });

  describe("hasActiveSubscription()", () => {
    it("解約・失効したものも含めてCustomerのサブスクリプションを一覧する", async () => {
      listSubscriptionsMock.mockResolvedValue(subscriptions());

      await gateway.hasActiveSubscription("cus_1");

      expect(listSubscriptionsMock).toHaveBeenCalledWith({
        customer: "cus_1",
        status: "all",
        limit: 100,
      });
    });

    it.each([
      "incomplete",
      "active",
      "trialing",
      "past_due",
      "unpaid",
      "paused",
    ])("%sのサブスクリプションがあればtrue", async (status) => {
      listSubscriptionsMock.mockResolvedValue(
        subscriptions("canceled", status)
      );

      await expect(gateway.hasActiveSubscription("cus_1")).resolves.toBe(true);
    });

    it("canceled・incomplete_expiredしか無ければfalse", async () => {
      listSubscriptionsMock.mockResolvedValue(
        subscriptions("canceled", "incomplete_expired")
      );

      await expect(gateway.hasActiveSubscription("cus_1")).resolves.toBe(false);
    });

    it("サブスクリプションが無ければfalse", async () => {
      listSubscriptionsMock.mockResolvedValue(subscriptions());

      await expect(gateway.hasActiveSubscription("cus_1")).resolves.toBe(false);
    });
  });

  describe("createCheckoutSession()", () => {
    it("Customerを指定し、Subscriptionにもclerk_user_idを持たせる", async () => {
      createCheckoutSessionMock.mockResolvedValue({
        id: "cs_1",
        url: "https://checkout.stripe.com/c/pay/cs_1",
      });

      const url = await gateway.createCheckoutSession({
        userId: USER_ID,
        clerkUserId: "clerk-1",
        stripeCustomerId: "cus_1",
        rank: "premium",
      });

      expect(url).toBe("https://checkout.stripe.com/c/pay/cs_1");
      const [params, options] = createCheckoutSessionMock.mock.calls[0];
      expect(params).toMatchObject({
        mode: "subscription",
        customer: "cus_1",
        line_items: [
          { price: "price_premium", quantity: 1 },
          { price: "price_premium_fee", quantity: 1 },
        ],
        metadata: { clerk_user_id: "clerk-1", plan: "premium" },
        subscription_data: { metadata: { clerk_user_id: "clerk-1" } },
        success_url:
          "http://localhost:3000/onboarding/payment/success?session_id={CHECKOUT_SESSION_ID}",
        cancel_url: "http://localhost:3000/onboarding/payment/cancel",
      });
      expect(params).not.toHaveProperty("customer_email");
      expect(options).toEqual({
        idempotencyKey: `onboarding-checkout-session-${USER_ID}-premium`,
      });
    });

    it("決済手段をカードに限定し、決済完了時点（checkout.session.completed）で支払い済みにする", async () => {
      createCheckoutSessionMock.mockResolvedValue({
        id: "cs_1",
        url: "https://checkout.stripe.com/c/pay/cs_1",
      });

      await gateway.createCheckoutSession({
        userId: USER_ID,
        clerkUserId: "clerk-1",
        stripeCustomerId: "cus_1",
        rank: "premium",
      });

      const [params] = createCheckoutSessionMock.mock.calls[0];
      expect(params.payment_method_types).toEqual(["card"]);
    });
  });
});
