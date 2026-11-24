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
      cancel_at_period_end: false,
      ended_at: null,
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
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });
    expect(retrieveSubscriptionMock).toHaveBeenCalledWith("sub_1");
  });

  // GitHub issue #377。Stripeのcanceled_atは期末解約の予約時にも入るため、
  // 解約が確定した日時にはended_atを使う
  it("期末解約の予約はcancelAtPeriodEndに、解約の確定日時はended_atからcanceledAtに変換する", async () => {
    const start = new Date(2026, 0, 1);
    const end = new Date(2026, 1, 1);
    const endedAt = new Date(2026, 0, 20);
    retrieveSubscriptionMock.mockResolvedValue({
      id: "sub_1",
      status: "canceled",
      start_date: toUnix(start),
      cancel_at_period_end: true,
      canceled_at: toUnix(new Date(2026, 0, 10)),
      ended_at: toUnix(endedAt),
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
    ).resolves.toMatchObject({
      status: "canceled",
      cancelAtPeriodEnd: true,
      canceledAt: endedAt,
    });
  });
});
