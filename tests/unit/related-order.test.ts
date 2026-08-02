import { describe, it, expect } from "vitest";
import { pickRelatedOrder } from "@/lib/order/related-order";

describe("pickRelatedOrder", () => {
  it("自分以外の注文が1件あればそれを返す", () => {
    const orders = [
      {
        id: "order-a",
        paymentFlow: "checkout" as const,
        status: "pending_payment",
      },
      { id: "order-b", paymentFlow: "invoice" as const, status: "confirming" },
    ];

    const result = pickRelatedOrder("order-a", orders);

    expect(result).toEqual({
      id: "order-b",
      paymentFlow: "invoice",
      status: "confirming",
    });
  });

  it("自分自身しかない場合はnullを返す", () => {
    const orders = [
      {
        id: "order-a",
        paymentFlow: "checkout" as const,
        status: "pending_payment",
      },
    ];

    expect(pickRelatedOrder("order-a", orders)).toBeNull();
  });

  it("空配列の場合はnullを返す", () => {
    expect(pickRelatedOrder("order-a", [])).toBeNull();
  });
});
