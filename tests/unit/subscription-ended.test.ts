import { describe, it, expect } from "vitest";
import { isSubscriptionEnded } from "@/domain/services/subscription-ended";

// GitHub issue #380: 再請求が尽きて Stripe がサブスクリプションを解約した会員の利用を止める。
// 判定のルールは docs/domain/membership.md「Stripe側の解約による利用停止」
describe("isSubscriptionEnded", () => {
  it.each(["canceled", "incomplete_expired"])(
    "入会済みで、サブスクリプションが %s だけなら利用停止",
    (status) => {
      expect(
        isSubscriptionEnded({
          onboardingCompleted: true,
          subscriptionStatuses: [status],
        })
      ).toBe(true);
    }
  );

  it("入会済みで、サブスクリプションの行が1つも無ければ利用停止", () => {
    expect(
      isSubscriptionEnded({
        onboardingCompleted: true,
        subscriptionStatuses: [],
      })
    ).toBe(true);
  });

  it.each(["trialing", "active", "past_due", "unpaid", "incomplete"])(
    "入会済みで、解約済みでないサブスクリプション（%s）があれば利用停止ではない",
    (status) => {
      expect(
        isSubscriptionEnded({
          onboardingCompleted: true,
          subscriptionStatuses: ["canceled", status],
        })
      ).toBe(false);
    }
  );

  it("subscriptions.status に無い値は例外にする（黙って有効・解約済みのどちらかに倒さない）", () => {
    expect(() =>
      isSubscriptionEnded({
        onboardingCompleted: true,
        subscriptionStatuses: ["unknown"],
      })
    ).toThrow();
  });

  it("入会前（オンボーディング中）は、サブスクリプションの行が無くても利用停止ではない", () => {
    expect(
      isSubscriptionEnded({
        onboardingCompleted: false,
        subscriptionStatuses: [],
      })
    ).toBe(false);
  });
});
