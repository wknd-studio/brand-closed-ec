import { describe, it, expect, vi, beforeEach } from "vitest";

const cancelSubscriptionMock = vi.fn();
const retrieveSubscriptionMock = vi.fn();

vi.mock("@/infrastructure/stripe/client", () => ({
  getStripe: () => ({
    subscriptions: {
      cancel: cancelSubscriptionMock,
      retrieve: retrieveSubscriptionMock,
    },
  }),
}));

import { StripeSubscriptionGateway } from "@/infrastructure/stripe/stripe-subscription-gateway";

describe("StripeSubscriptionGateway.cancelSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("指定したサブスクリプションを解約する", async () => {
    cancelSubscriptionMock.mockResolvedValue({
      id: "sub_1",
      status: "canceled",
    });

    await expect(
      new StripeSubscriptionGateway().cancelSubscription("sub_1")
    ).resolves.toBeUndefined();

    expect(cancelSubscriptionMock).toHaveBeenCalledWith("sub_1");
  });

  it("Stripeのエラーは呼び出し元に伝える", async () => {
    const err = new Error("No such subscription");
    cancelSubscriptionMock.mockRejectedValue(err);

    await expect(
      new StripeSubscriptionGateway().cancelSubscription("sub_1")
    ).rejects.toBe(err);
  });
});

describe("StripeSubscriptionGateway.retrieveSubscription", () => {
  const toUnix = (date: Date) => Math.floor(date.getTime() / 1000);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Stripe のサブスクリプションを取得し、ステータス・期間・開始日時に変換する", async () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 1, 1);
    retrieveSubscriptionMock.mockResolvedValue({
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

    await expect(
      new StripeSubscriptionGateway().retrieveSubscription("sub_1")
    ).resolves.toEqual({
      status: "active",
      currentPeriodStart: start,
      currentPeriodEnd: end,
      startedAt: start,
    });
    expect(retrieveSubscriptionMock).toHaveBeenCalledWith("sub_1");
  });
});
