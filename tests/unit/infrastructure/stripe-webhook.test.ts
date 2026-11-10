import { describe, it, expect, vi, beforeEach } from "vitest";

const { constructEvent, retrieve } = vi.hoisted(() => ({
  constructEvent: vi.fn(),
  retrieve: vi.fn(),
}));

vi.mock("@/infrastructure/stripe/client", () => ({
  getStripe: () => ({
    webhooks: { constructEvent },
    subscriptions: { retrieve },
  }),
  STRIPE_PRICE_IDS: {
    starter: { monthly: "price_starter", initialFee: "price_starter_fee" },
  },
}));

import {
  constructStripeWebhookEvent,
  isPaidRank,
  retrieveOnboardingSubscription,
} from "@/infrastructure/stripe/stripe-webhook";

const toUnix = (date: Date) => Math.floor(date.getTime() / 1000);

describe("constructStripeWebhookEvent", () => {
  beforeEach(() => constructEvent.mockReset());

  it("本文・署名・シークレットを Stripe の署名検証に渡し、検証済みのイベントを返す", () => {
    const event = { id: "evt_1", type: "invoice.paid" };
    constructEvent.mockReturnValue(event);

    expect(constructStripeWebhookEvent("body", "sig", "whsec")).toBe(event);
    expect(constructEvent).toHaveBeenCalledWith("body", "sig", "whsec");
  });

  it("署名が不正なら Stripe のエラーをそのまま投げる", () => {
    constructEvent.mockImplementation(() => {
      throw new Error("No signatures found");
    });

    expect(() => constructStripeWebhookEvent("body", "bad", "whsec")).toThrow(
      "No signatures found"
    );
  });
});

describe("isPaidRank", () => {
  it("価格IDが設定されたセルフサービスのランクなら true", () => {
    expect(isPaidRank("starter")).toBe(true);
  });

  it("価格IDの無いランク（enterprise 等）や不正な値なら false", () => {
    expect(isPaidRank("enterprise")).toBe(false);
    expect(isPaidRank("toString")).toBe(false);
  });
});

describe("retrieveOnboardingSubscription", () => {
  beforeEach(() => retrieve.mockReset());

  it("Stripe のサブスクリプションを取得し、入会の確定に使うステータス・期間・開始日に変換する", async () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 1, 1);
    retrieve.mockResolvedValue({
      id: "sub_1",
      status: "active",
      start_date: toUnix(start),
      items: {
        data: [
          {
            current_period_start: toUnix(start),
            current_period_end: toUnix(end),
          },
        ],
      },
    });

    await expect(retrieveOnboardingSubscription("sub_1")).resolves.toEqual({
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
      subscriptionStartedAt: start,
    });
    expect(retrieve).toHaveBeenCalledWith("sub_1");
  });
});
