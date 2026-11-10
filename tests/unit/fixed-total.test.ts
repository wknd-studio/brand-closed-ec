import { describe, it, expect } from "vitest";
import { sumFixedTotal } from "@/domain/services/fixed-total";
import { CartItem } from "@/domain/value-objects/cart-item";
import { OrderItem } from "@/domain/entities/order-item";
import { Money } from "@/domain/value-objects/money";

function cartItem(unitPrice: number, quantity: number, isNegotiable = false) {
  return CartItem.of({
    sanityProductId: "prod-1",
    productName: "テスト商品",
    quantity,
    unitPrice: Money.of(unitPrice),
    isNegotiable,
    paymentTiming: "at_order",
  });
}

describe("sumFixedTotal", () => {
  it("要相談でない明細の小計の合計を返す（カートの明細）", () => {
    expect(
      sumFixedTotal([
        cartItem(10_000, 2),
        cartItem(5_000, 1),
        cartItem(0, 3, true),
      ]).amount
    ).toBe(25_000);
  });

  it("要相談の明細は、交渉済みの単価があっても含めない（注文の明細）", () => {
    const negotiated = OrderItem.of({
      id: "item-1",
      sanityProductId: "prod-1",
      productNameSnapshot: "交渉商品",
      unitPriceSnapshot: Money.zero(),
      quantity: 1,
      isNegotiable: true,
      negotiatedUnitPrice: Money.of(30_000),
      paymentTiming: "after_order",
      settlementId: null,
    });
    expect(sumFixedTotal([negotiated]).amount).toBe(0);
  });

  it("明細が無ければ0", () => {
    expect(sumFixedTotal([]).amount).toBe(0);
  });
});
