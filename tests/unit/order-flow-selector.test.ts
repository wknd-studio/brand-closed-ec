import { describe, it, expect } from "vitest";
import { OrderFlowSelector } from "@/domain/services/order-flow-selector";
import { CartItem } from "@/domain/value-objects/cart-item";
import { Money } from "@/domain/value-objects/money";

function makeFixedItem(): CartItem {
  return CartItem.of({
    sanityProductId: "prod-1",
    productName: "固定商品",
    quantity: 1,
    unitPrice: Money.of(10_000),
    isNegotiable: false,
  });
}

function makeNegotiableItem(): CartItem {
  return CartItem.of({
    sanityProductId: "prod-2",
    productName: "交渉商品",
    quantity: 1,
    unitPrice: Money.zero(),
    isNegotiable: true,
  });
}

describe("OrderFlowSelector", () => {
  const selector = new OrderFlowSelector();

  it("全て固定価格なら checkout を返す", () => {
    const items = [makeFixedItem(), makeFixedItem()];
    expect(selector.select(items)).toBe("checkout");
  });

  it("交渉品が1つでもあれば invoice を返す", () => {
    const items = [makeFixedItem(), makeNegotiableItem()];
    expect(selector.select(items)).toBe("invoice");
  });

  it("全て交渉品なら invoice を返す", () => {
    const items = [makeNegotiableItem(), makeNegotiableItem()];
    expect(selector.select(items)).toBe("invoice");
  });
});
