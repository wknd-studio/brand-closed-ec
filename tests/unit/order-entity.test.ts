import { describe, it, expect } from "vitest";
import { Order } from "@/domain/entities/order";
import { OrderItem } from "@/domain/entities/order-item";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";

const snapshotProps = {
  recipientLastName: "山田",
  recipientFirstName: "太郎",
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  addressLine1: "丸の内1-1-1",
  addressLine2: "",
  phoneNumber: "03-1234-5678",
};

function makeItem(
  overrides: Partial<{
    isNegotiable: boolean;
    unitPrice: number;
    negotiatedUnitPrice: number | null;
    quantity: number;
  }> = {}
) {
  const {
    isNegotiable = false,
    unitPrice = 10_000,
    negotiatedUnitPrice = null,
    quantity = 1,
  } = overrides;
  return OrderItem.of({
    id: "item-001",
    sanityProductId: "prod-001",
    productNameSnapshot: "テスト商品",
    unitPriceSnapshot: Money.of(unitPrice),
    quantity,
    isNegotiable,
    negotiatedUnitPrice:
      negotiatedUnitPrice !== null ? Money.of(negotiatedUnitPrice) : null,
  });
}

function makeOrder(overrides: Partial<Parameters<typeof Order.of>[0]> = {}) {
  return Order.of({
    id: "order-001",
    userId: "user-001",
    paymentFlow: "checkout",
    status: OrderStatus.of("paid"),
    shippingAddress: AddressSnapshot.of(snapshotProps),
    billingAddress: AddressSnapshot.of(snapshotProps),
    rankAtOrder: MemberRank.of("basic"),
    monthlyLimitAtOrder: Money.of(1_000_000),
    stripeCheckoutSessionId: "cs_test_001",
    stripeInvoiceId: null,
    items: [makeItem()],
    createdAt: new Date(2026, 5, 1),
    ...overrides,
  });
}

describe("Order", () => {
  describe("isInvoiceFlow()", () => {
    it("paymentFlow が invoice のとき true", () => {
      expect(makeOrder({ paymentFlow: "invoice" }).isInvoiceFlow()).toBe(true);
    });

    it("paymentFlow が checkout のとき false", () => {
      expect(makeOrder({ paymentFlow: "checkout" }).isInvoiceFlow()).toBe(
        false
      );
    });
  });

  describe("canAdvanceStatus()", () => {
    it("paid は true", () => {
      expect(
        makeOrder({ status: OrderStatus.of("paid") }).canAdvanceStatus()
      ).toBe(true);
    });

    it("delivered は false", () => {
      expect(
        makeOrder({ status: OrderStatus.of("delivered") }).canAdvanceStatus()
      ).toBe(false);
    });
  });

  describe("nextStatus()", () => {
    it("paid → sourcing", () => {
      expect(
        makeOrder({ status: OrderStatus.of("paid") }).nextStatus().value
      ).toBe("sourcing");
    });
  });

  describe("canCancel()", () => {
    it("pending_payment はキャンセル可能", () => {
      expect(
        makeOrder({ status: OrderStatus.of("pending_payment") }).canCancel()
      ).toBe(true);
    });

    it("paid はキャンセル不可", () => {
      expect(makeOrder({ status: OrderStatus.of("paid") }).canCancel()).toBe(
        false
      );
    });
  });

  describe("getFixedTotal()", () => {
    it("isNegotiable=false のアイテムの合計を返す", () => {
      const order = makeOrder({
        items: [
          makeItem({ isNegotiable: false, unitPrice: 10_000, quantity: 2 }),
          makeItem({ isNegotiable: true, unitPrice: 50_000, quantity: 1 }),
        ],
      });
      expect(order.getFixedTotal().amount).toBe(20_000);
    });

    it("全アイテムが要相談の場合は 0", () => {
      const order = makeOrder({
        items: [makeItem({ isNegotiable: true, unitPrice: 50_000 })],
      });
      expect(order.getFixedTotal().amount).toBe(0);
    });
  });
});
