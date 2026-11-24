import { describe, it, expect } from "vitest";
import { SubscriptionStatus } from "@/domain/value-objects/subscription-status";

// subscriptions.status から会員から見た状態を判定する（docs/domain/subscription-billing.md「支払い失敗・Stripe側の解約」）
describe("SubscriptionStatus", () => {
  describe("of()", () => {
    it("有効な値を受け付ける", () => {
      expect(SubscriptionStatus.of("past_due").value).toBe("past_due");
    });

    it("無効な値はエラーになる", () => {
      expect(() => SubscriptionStatus.of("paused")).toThrow();
    });
  });

  describe("isPaymentFailing()", () => {
    it.each(["past_due", "unpaid"])("%s は支払い失敗中", (status) => {
      expect(SubscriptionStatus.of(status).isPaymentFailing()).toBe(true);
    });

    it.each([
      "active",
      "trialing",
      "canceled",
      "incomplete",
      "incomplete_expired",
    ])("%s は支払い失敗中ではない", (status) => {
      expect(SubscriptionStatus.of(status).isPaymentFailing()).toBe(false);
    });
  });
});
