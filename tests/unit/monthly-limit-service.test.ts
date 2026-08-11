import { describe, it, expect } from "vitest";
import { checkMonthlyLimit } from "@/domain/services/monthly-limit-service";
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import { CartItem } from "@/domain/value-objects/cart-item";
import { Money } from "@/domain/value-objects/money";
import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";

function makeUser(rankValue: string): User {
  return User.of({
    id: "user-1",
    clerkUserId: "clerk-1",
    email: "test@example.com",
    firstName: "太郎",
    lastName: "山田",
    phoneNumber: "09012345678",
    profileCompletedAt: new Date(2026, 0, 1),
    rank: MemberRank.of(rankValue),
    subscribedAt: new Date(2026, 0, 1),
    onboardingCompleted: true,
    deletedAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });
}

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
    const user = makeUser("standard"); // 上限5,000,000円
    const cartItems = [makeFixedItem(1_000_000)];
    const confirmed = Money.of(2_000_000);

    expect(() => checkMonthlyLimit(user, cartItems, confirmed)).not.toThrow();
  });

  it("固定金額合計 + 確定済み金額が上限を超えたら LimitExceededError を投げる", () => {
    const user = makeUser("standard"); // 上限5,000,000円
    const cartItems = [makeFixedItem(3_000_000)];
    const confirmed = Money.of(3_000_000);

    expect(() => checkMonthlyLimit(user, cartItems, confirmed)).toThrow(
      LimitExceededError
    );
  });

  it("交渉品はfixedTotal計算に含めない", () => {
    const user = makeUser("standard");
    const cartItems = [makeFixedItem(1_000_000), makeNegotiableItem()];
    const confirmed = Money.of(3_000_000);

    // 固定のみ1,000,000 + 確定済み3,000,000 = 4,000,000 < 5,000,000 → OK
    expect(() => checkMonthlyLimit(user, cartItems, confirmed)).not.toThrow();
  });

  it("ちょうど上限と同額なら例外を投げない", () => {
    const user = makeUser("standard"); // 上限5,000,000円
    const cartItems = [makeFixedItem(2_500_000)];
    const confirmed = Money.of(2_500_000);

    expect(() => checkMonthlyLimit(user, cartItems, confirmed)).not.toThrow();
  });

  it("LimitExceededErrorは試行金額と上限を保持する", () => {
    const user = makeUser("standard"); // 上限5,000,000円
    const cartItems = [makeFixedItem(3_000_000)];
    const confirmed = Money.of(3_000_000);

    let caught: LimitExceededError | undefined;
    try {
      checkMonthlyLimit(user, cartItems, confirmed);
    } catch (e) {
      caught = e as LimitExceededError;
    }

    expect(caught).toBeInstanceOf(LimitExceededError);
    expect(caught?.attempted).toBe(6_000_000);
    expect(caught?.limit).toBe(5_000_000);
  });
});
