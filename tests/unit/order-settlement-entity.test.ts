import { describe, it, expect } from "vitest";
import { OrderSettlement } from "@/domain/entities/order-settlement";
import { Money } from "@/domain/value-objects/money";

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

describe("OrderSettlement", () => {
  describe("markPaid()", () => {
    it("statusをpaidにしpaidAtを設定する（元のインスタンスは変更しない）", () => {
      const at = new Date(2026, 8, 21);
      const settlement = makeSettlement();

      const paid = settlement.markPaid(at);

      expect(paid.status).toBe("paid");
      expect(paid.paidAt).toBe(at);
      expect(settlement.status).toBe("pending_payment");
      expect(settlement.paidAt).toBeNull();
    });

    it("invoice_sentからもpaidにできる", () => {
      const paid = makeSettlement({
        flow: "invoice",
        status: "invoice_sent",
        stripeCheckoutSessionId: null,
        stripeInvoiceId: "in_test_001",
      }).markPaid(new Date());
      expect(paid.status).toBe("paid");
    });

    it("cancelled済みの決済単位はpaidにできない", () => {
      expect(() =>
        makeSettlement({ status: "cancelled" }).markPaid(new Date())
      ).toThrow();
    });
  });

  describe("cancel()", () => {
    it("statusをcancelledにしcancelledAtを設定する", () => {
      const at = new Date(2026, 8, 21);
      const cancelled = makeSettlement().cancel(at);
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelledAt).toBe(at);
    });

    it("paid済みの決済単位はcancelできない（返金は別フロー）", () => {
      expect(() =>
        makeSettlement({ status: "paid", paidAt: new Date() }).cancel(
          new Date()
        )
      ).toThrow();
    });
  });

  describe("isPaid() / isCancelled()", () => {
    it("statusに対応する真偽を返す", () => {
      expect(makeSettlement({ status: "paid" }).isPaid()).toBe(true);
      expect(makeSettlement().isPaid()).toBe(false);
      expect(makeSettlement({ status: "cancelled" }).isCancelled()).toBe(true);
      expect(makeSettlement().isCancelled()).toBe(false);
    });
  });
});
