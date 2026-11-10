import { describe, it, expect, vi, beforeEach } from "vitest";

const cancelSubscriptionMock = vi.fn();

vi.mock("@/infrastructure/stripe/client", () => ({
  getStripe: () => ({
    subscriptions: { cancel: cancelSubscriptionMock },
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
