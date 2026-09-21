import { describe, it, expect } from "vitest";
import { Order } from "@/domain/entities/order";
import { OrderItem } from "@/domain/entities/order-item";
import { OrderSettlement } from "@/domain/entities/order-settlement";
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
    id: string;
    isNegotiable: boolean;
    unitPrice: number;
    negotiatedUnitPrice: number | null;
    quantity: number;
    paymentTiming: "at_order" | "after_order";
    settlementId: string | null;
  }> = {}
) {
  const {
    id = "item-001",
    isNegotiable = false,
    unitPrice = 10_000,
    negotiatedUnitPrice = null,
    quantity = 1,
    paymentTiming = "at_order",
    settlementId = null,
  } = overrides;
  return OrderItem.of({
    id,
    sanityProductId: "prod-001",
    productNameSnapshot: "テスト商品",
    unitPriceSnapshot: Money.of(unitPrice),
    quantity,
    isNegotiable,
    negotiatedUnitPrice:
      negotiatedUnitPrice !== null ? Money.of(negotiatedUnitPrice) : null,
    paymentTiming,
    settlementId,
  });
}

function makeSettlement(
  overrides: Partial<Parameters<typeof OrderSettlement.of>[0]> = {}
) {
  return OrderSettlement.of({
    id: "settlement-001",
    orderId: "order-001",
    flow: "checkout",
    status: "pending_payment",
    stripeCheckoutSessionId: "cs_test_001",
    stripeInvoiceId: null,
    amount: Money.of(10_000),
    paidAt: null,
    cancelledAt: null,
    ...overrides,
  });
}

function makeOrder(overrides: Partial<Parameters<typeof Order.of>[0]> = {}) {
  return Order.of({
    id: "order-001",
    userId: "user-001",
    status: OrderStatus.of("processing"),
    shippingAddress: AddressSnapshot.of(snapshotProps),
    billingAddress: AddressSnapshot.of(snapshotProps),
    rankAtOrder: MemberRank.of("basic"),
    monthlyLimitAtOrder: Money.of(1_000_000),
    items: [makeItem()],
    settlements: [],
    createdAt: new Date(2026, 5, 1),
    ...overrides,
  });
}

describe("Order", () => {
  describe("canCancel()", () => {
    it("processing（決済単位が未払い）はキャンセル可能", () => {
      const order = makeOrder({
        settlements: [makeSettlement()],
      });
      expect(order.canCancel()).toBe(true);
    });

    it("limit_exceeded はキャンセル可能", () => {
      expect(
        makeOrder({ status: OrderStatus.of("limit_exceeded") }).canCancel()
      ).toBe(true);
    });

    it("paid はキャンセル不可", () => {
      expect(makeOrder({ status: OrderStatus.of("paid") }).canCancel()).toBe(
        false
      );
    });

    it("cancelled はキャンセル不可", () => {
      expect(
        makeOrder({ status: OrderStatus.of("cancelled") }).canCancel()
      ).toBe(false);
    });

    it("processingでも支払い済みの決済単位が1件でもあればキャンセル不可（返金は別フロー）", () => {
      const order = makeOrder({
        settlements: [
          makeSettlement({ id: "s1", status: "paid", paidAt: new Date() }),
          makeSettlement({ id: "s2", flow: "invoice", status: "invoice_sent" }),
        ],
      });
      expect(order.canCancel()).toBe(false);
    });
  });

  describe("cancel()", () => {
    it("注文をcancelledにし、未払いの決済単位をcancelledにする", () => {
      const at = new Date(2026, 8, 21);
      const order = makeOrder({
        settlements: [
          makeSettlement({ id: "s1" }),
          makeSettlement({
            id: "s2",
            flow: "invoice",
            status: "limit_exceeded",
          }),
        ],
      });

      const cancelled = order.cancel(at);

      expect(cancelled.status.value).toBe("cancelled");
      expect(cancelled.settlements.map((s) => s.status)).toEqual([
        "cancelled",
        "cancelled",
      ]);
      expect(cancelled.settlements[0]?.cancelledAt).toBe(at);
    });

    it("キャンセル不可の注文はエラー", () => {
      expect(() =>
        makeOrder({ status: OrderStatus.of("paid") }).cancel(new Date())
      ).toThrow();
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

  // docs/domain/settlement.md「orders.statusのロールアップ算出」
  describe("rollupStatus()", () => {
    it("注文自体がcancelledならcancelled（他の条件より優先）", () => {
      const order = makeOrder({
        status: OrderStatus.of("cancelled"),
        settlements: [makeSettlement({ status: "limit_exceeded" })],
      });
      expect(order.rollupStatus().value).toBe("cancelled");
    });

    it("いずれかの決済単位がlimit_exceededならlimit_exceeded（paidより優先）", () => {
      const order = makeOrder({
        items: [
          makeItem({ id: "i1", settlementId: "s1" }),
          makeItem({ id: "i2", settlementId: "s2" }),
        ],
        settlements: [
          makeSettlement({ id: "s1", status: "paid", paidAt: new Date() }),
          makeSettlement({
            id: "s2",
            flow: "invoice",
            status: "limit_exceeded",
          }),
        ],
      });
      expect(order.rollupStatus().value).toBe("limit_exceeded");
    });

    it("全明細がpaidの決済単位に属していればpaid", () => {
      const order = makeOrder({
        items: [
          makeItem({ id: "i1", settlementId: "s1" }),
          makeItem({
            id: "i2",
            paymentTiming: "after_order",
            settlementId: "s2",
          }),
        ],
        settlements: [
          makeSettlement({ id: "s1", status: "paid", paidAt: new Date() }),
          makeSettlement({
            id: "s2",
            flow: "invoice",
            status: "paid",
            paidAt: new Date(),
          }),
        ],
      });
      expect(order.rollupStatus().value).toBe("paid");
    });

    it("settlement_idがNULLの明細（請求作成前のafter_order）が残っていればprocessing", () => {
      const order = makeOrder({
        items: [
          makeItem({ id: "i1", settlementId: "s1" }),
          makeItem({
            id: "i2",
            paymentTiming: "after_order",
            settlementId: null,
          }),
        ],
        settlements: [
          makeSettlement({ id: "s1", status: "paid", paidAt: new Date() }),
        ],
      });
      expect(order.rollupStatus().value).toBe("processing");
    });

    it.each(["pending_payment", "invoice_sent"] as const)(
      "%sの決済単位が残っていればprocessing",
      (status) => {
        const order = makeOrder({
          items: [makeItem({ id: "i1", settlementId: "s1" })],
          settlements: [makeSettlement({ id: "s1", status })],
        });
        expect(order.rollupStatus().value).toBe("processing");
      }
    );

    it("cancelledの決済単位に属する明細は完了判定から除外する", () => {
      const order = makeOrder({
        items: [
          makeItem({ id: "i1", settlementId: "s1" }),
          makeItem({ id: "i2", settlementId: "s2" }),
        ],
        settlements: [
          makeSettlement({ id: "s1", status: "paid", paidAt: new Date() }),
          makeSettlement({
            id: "s2",
            flow: "invoice",
            status: "cancelled",
            cancelledAt: new Date(),
          }),
        ],
      });
      expect(order.rollupStatus().value).toBe("paid");
    });

    it("決済単位が1件も無い注文はprocessing", () => {
      expect(makeOrder().rollupStatus().value).toBe("processing");
    });
  });

  describe("applySettlement()", () => {
    it("同じidの決済単位を差し替え、statusをロールアップし直す", () => {
      const order = makeOrder({
        items: [makeItem({ id: "i1", settlementId: "s1" })],
        settlements: [makeSettlement({ id: "s1" })],
      });

      const updated = order.applySettlement(
        order.settlements[0]!.markPaid(new Date())
      );

      expect(updated.settlements[0]?.status).toBe("paid");
      expect(updated.status.value).toBe("paid");
      expect(order.status.value).toBe("processing");
    });

    it("存在しないidの決済単位は追加される", () => {
      const order = makeOrder();
      const updated = order.applySettlement(makeSettlement({ id: "s-new" }));
      expect(updated.settlements).toHaveLength(1);
    });
  });
});
