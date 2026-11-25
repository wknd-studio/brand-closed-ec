import { describe, it, expect } from "vitest";
import { SubscriptionStatus } from "@/domain/value-objects/subscription-status";

// GitHub issue #777: どの状態が「解約済み（以後の請求も利用も無い）」かのルールの正。
// docs/domain/membership.md「Stripe側の解約による利用停止」
describe("SubscriptionStatus", () => {
  describe("of()", () => {
    it.each([
      "trialing",
      "active",
      "past_due",
      "unpaid",
      "canceled",
      "incomplete",
      "incomplete_expired",
    ])("%s を受け付ける", (status) => {
      expect(SubscriptionStatus.of(status).value).toBe(status);
    });

    it.each(["paused", "unknown", ""])(
      "subscriptions.status に無い値 %s はエラーになる",
      (status) => {
        expect(() => SubscriptionStatus.of(status)).toThrow();
      }
    );
  });

  describe("isEnded()", () => {
    it.each(["canceled", "incomplete_expired"])("%s は解約済み", (status) => {
      expect(SubscriptionStatus.of(status).isEnded()).toBe(true);
    });

    it.each(["trialing", "active", "past_due", "unpaid", "incomplete"])(
      "%s は解約済みではない（再請求中・支払い待ちを含む）",
      (status) => {
        expect(SubscriptionStatus.of(status).isEnded()).toBe(false);
      }
    );
  });

  describe("endedValues()", () => {
    it("解約済みの状態の一覧を返す（repository のクエリの条件に使う）", () => {
      expect([...SubscriptionStatus.endedValues()].sort()).toEqual([
        "canceled",
        "incomplete_expired",
      ]);
    });

    it("一覧の値はすべて isEnded() が true になる", () => {
      for (const value of SubscriptionStatus.endedValues()) {
        expect(SubscriptionStatus.of(value).isEnded()).toBe(true);
      }
    });
  });
});
