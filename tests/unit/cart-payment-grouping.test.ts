import { describe, it, expect } from "vitest";
import { groupCartItemsByPaymentTiming } from "@/lib/cart/types";
import type { CartItem } from "@/lib/cart/types";

function makeItem(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: "p1",
    productName: "商品",
    thumbnail: null,
    quantity: 1,
    unitPrice: 10_000,
    availability: "available",
    paymentTiming: "at_order",
    ...overrides,
  };
}

describe("groupCartItemsByPaymentTiming", () => {
  it("at_order/after_orderが混在する場合、両方のグループを返す", () => {
    const atOrderItem = makeItem({
      productId: "p1",
      paymentTiming: "at_order",
    });
    const afterOrderItem = makeItem({
      productId: "p2",
      paymentTiming: "after_order",
    });

    const result = groupCartItemsByPaymentTiming([atOrderItem, afterOrderItem]);

    expect(result).not.toBeNull();
    expect(result!.atOrder).toEqual([atOrderItem]);
    expect(result!.afterOrder).toEqual([afterOrderItem]);
  });

  it("全てat_orderの場合はnullを返す（グループ化不要）", () => {
    const items = [
      makeItem({ productId: "p1", paymentTiming: "at_order" }),
      makeItem({ productId: "p2", paymentTiming: "at_order" }),
    ];

    expect(groupCartItemsByPaymentTiming(items)).toBeNull();
  });

  it("全てafter_orderの場合はnullを返す（グループ化不要）", () => {
    const items = [
      makeItem({ productId: "p1", paymentTiming: "after_order" }),
      makeItem({ productId: "p2", paymentTiming: "after_order" }),
    ];

    expect(groupCartItemsByPaymentTiming(items)).toBeNull();
  });

  it("空配列の場合はnullを返す", () => {
    expect(groupCartItemsByPaymentTiming([])).toBeNull();
  });
});
