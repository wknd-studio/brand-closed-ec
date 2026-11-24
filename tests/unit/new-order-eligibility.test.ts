import { describe, it, expect } from "vitest";
import {
  assertCanPlaceNewOrder,
  isSubscriptionPaymentFailed,
} from "@/domain/services/new-order-eligibility";
import { SubscriptionPaymentFailedError } from "@/domain/errors/subscription-payment-failed-error";
import { DomainError } from "@/domain/errors/domain-error";

describe("isSubscriptionPaymentFailed（月額費用の支払い失敗中か）", () => {
  it.each(["past_due", "unpaid"] as const)("%s は支払い失敗中", (status) => {
    expect(isSubscriptionPaymentFailed(status)).toBe(true);
  });

  it.each(["active", "trialing"] as const)(
    "%s は支払い失敗中ではない",
    (status) => {
      expect(isSubscriptionPaymentFailed(status)).toBe(false);
    }
  );

  it("サブスクリプションの行が無い会員は支払い失敗中ではない", () => {
    expect(isSubscriptionPaymentFailed(null)).toBe(false);
  });
});

describe("assertCanPlaceNewOrder（新規注文を確定できるか）", () => {
  it.each(["past_due", "unpaid"] as const)(
    "%s なら SubscriptionPaymentFailedError を投げる",
    (status) => {
      expect(() => assertCanPlaceNewOrder(status)).toThrow(
        SubscriptionPaymentFailedError
      );
    }
  );

  it.each(["active", "trialing", null] as const)("%s なら通す", (status) => {
    expect(() => assertCanPlaceNewOrder(status)).not.toThrow();
  });

  it("SubscriptionPaymentFailedError は DomainError", () => {
    expect(new SubscriptionPaymentFailedError()).toBeInstanceOf(DomainError);
  });
});
