import { describe, it, expect } from "vitest";
import { checkMonthlyLimit } from "@/domain/services/monthly-limit-service";
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import { CartItem } from "@/domain/value-objects/cart-item";
import { Money } from "@/domain/value-objects/money";
import { MonthlyLimit } from "@/domain/value-objects/monthly-limit";

// standardランクの上限（member_ranks の値）を想定した上限
const standardLimit = MonthlyLimit.of(5_000_000);

function makeFixedItem(amount: number, quantity = 1): CartItem {
  return CartItem.of({
    sanityProductId: "prod-1",
    productName: "テスト商品",
    quantity,
    unitPrice: Money.of(amount),
    isNegotiable: false,
    paymentTiming: "at_order",
  });
}

function makeNegotiableItem(): CartItem {
  return CartItem.of({
    sanityProductId: "prod-2",
    productName: "交渉商品",
    quantity: 1,
    unitPrice: Money.zero(),
    isNegotiable: true,
    paymentTiming: "after_order",
  });
}

describe("checkMonthlyLimit", () => {
  it("固定金額合計 + 確定済み金額が上限以内なら例外を投げない", () => {
    const cartItems = [makeFixedItem(1_000_000)];
    const confirmed = Money.of(2_000_000);

    expect(() =>
      checkMonthlyLimit(standardLimit, cartItems, confirmed)
    ).not.toThrow();
  });

  it("固定金額合計 + 確定済み金額が上限を超えたら LimitExceededError を投げる", () => {
    const cartItems = [makeFixedItem(3_000_000)];
    const confirmed = Money.of(3_000_000);

    expect(() =>
      checkMonthlyLimit(standardLimit, cartItems, confirmed)
    ).toThrow(LimitExceededError);
  });

  it("交渉品はfixedTotal計算に含めない", () => {
    const cartItems = [makeFixedItem(1_000_000), makeNegotiableItem()];
    const confirmed = Money.of(3_000_000);

    // 固定のみ1,000,000 + 確定済み3,000,000 = 4,000,000 < 5,000,000 → OK
    expect(() =>
      checkMonthlyLimit(standardLimit, cartItems, confirmed)
    ).not.toThrow();
  });

  it("ちょうど上限と同額なら例外を投げない", () => {
    const cartItems = [makeFixedItem(2_500_000)];
    const confirmed = Money.of(2_500_000);

    expect(() =>
      checkMonthlyLimit(standardLimit, cartItems, confirmed)
    ).not.toThrow();
  });

  it("LimitExceededErrorは試行金額と上限を保持する", () => {
    const cartItems = [makeFixedItem(3_000_000)];
    const confirmed = Money.of(3_000_000);

    let caught: LimitExceededError | undefined;
    try {
      checkMonthlyLimit(standardLimit, cartItems, confirmed);
    } catch (e) {
      caught = e as LimitExceededError;
    }

    expect(caught).toBeInstanceOf(LimitExceededError);
    expect(caught?.attempted).toBe(6_000_000);
    expect(caught?.limit).toBe(5_000_000);
  });

  it("無制限の上限なら、どれだけ大きな金額でも例外を投げない", () => {
    const cartItems = [makeFixedItem(1_000_000_000)];
    const confirmed = Money.of(Number.MAX_SAFE_INTEGER - 1_000_000_000);

    expect(() =>
      checkMonthlyLimit(MonthlyLimit.unlimited(), cartItems, confirmed)
    ).not.toThrow();
  });
});
