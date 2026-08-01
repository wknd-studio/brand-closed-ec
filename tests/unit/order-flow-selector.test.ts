import { describe, it, expect } from "vitest";
import { splitCartByPaymentTiming } from "@/domain/services/order-flow-selector";
import { CartItem } from "@/domain/value-objects/cart-item";
import { Money } from "@/domain/value-objects/money";

function makeAtOrderItem(): CartItem {
  return CartItem.of({
    sanityProductId: "prod-1",
    productName: "先払い商品",
    quantity: 1,
    unitPrice: Money.of(10_000),
    isNegotiable: false,
    paymentTiming: "at_order",
  });
}

function makeAfterOrderItem(): CartItem {
  return CartItem.of({
    sanityProductId: "prod-2",
    productName: "後払い商品",
    quantity: 1,
    unitPrice: Money.of(20_000),
    isNegotiable: false,
    paymentTiming: "after_order",
  });
}

function makeNegotiableItem(): CartItem {
  return CartItem.of({
    sanityProductId: "prod-3",
    productName: "交渉商品",
    quantity: 1,
    unitPrice: Money.zero(),
    isNegotiable: true,
    paymentTiming: "after_order",
  });
}

describe("splitCartByPaymentTiming", () => {
  it("全て at_order なら atOrderItems のみに分類される", () => {
    const items = [makeAtOrderItem(), makeAtOrderItem()];
    const result = splitCartByPaymentTiming(items);
    expect(result.atOrderItems).toHaveLength(2);
    expect(result.afterOrderItems).toHaveLength(0);
  });

  it("全て after_order なら afterOrderItems のみに分類される", () => {
    const items = [makeAfterOrderItem(), makeAfterOrderItem()];
    const result = splitCartByPaymentTiming(items);
    expect(result.atOrderItems).toHaveLength(0);
    expect(result.afterOrderItems).toHaveLength(2);
  });

  it("混在する場合は両方に分類される", () => {
    const items = [makeAtOrderItem(), makeAfterOrderItem()];
    const result = splitCartByPaymentTiming(items);
    expect(result.atOrderItems).toHaveLength(1);
    expect(result.afterOrderItems).toHaveLength(1);
  });

  it("交渉商品（要相談）は after_order 扱いになる", () => {
    const items = [makeAtOrderItem(), makeNegotiableItem()];
    const result = splitCartByPaymentTiming(items);
    expect(result.atOrderItems).toHaveLength(1);
    expect(result.afterOrderItems).toHaveLength(1);
    expect(result.afterOrderItems[0].isNegotiable).toBe(true);
  });

  it("空配列の場合は両方とも空配列を返す", () => {
    const result = splitCartByPaymentTiming([]);
    expect(result.atOrderItems).toEqual([]);
    expect(result.afterOrderItems).toEqual([]);
  });
});
