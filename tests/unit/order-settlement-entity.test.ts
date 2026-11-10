import { describe, it, expect } from "vitest";
import {
  OrderSettlement,
  isAllowedSettlementTransition,
  type SettlementStatus,
} from "@/domain/entities/order-settlement";
import { InvalidStatusTransitionError } from "@/domain/errors/invalid-status-transition-error";
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

const STATUSES: SettlementStatus[] = [
  "pending_payment",
  "invoice_sent",
  "limit_exceeded",
  "paid",
  "cancelled",
];

/** docs/domain/settlement.md「決済単位ごとの状態遷移」から起こした、許可する遷移 */
const ALLOWED: ReadonlyArray<readonly [SettlementStatus, SettlementStatus]> = [
  ["pending_payment", "paid"],
  ["pending_payment", "cancelled"],
  ["invoice_sent", "paid"],
  ["invoice_sent", "cancelled"],
  ["limit_exceeded", "cancelled"],
];

function isAllowed(from: SettlementStatus, to: SettlementStatus): boolean {
  return ALLOWED.some(([f, t]) => f === from && t === to);
}

const ALL_PAIRS = STATUSES.flatMap((from) =>
  STATUSES.map((to) => [from, to] as const)
);

describe("OrderSettlement", () => {
  describe("isAllowedSettlementTransition()", () => {
    it.each(ALL_PAIRS.filter(([from, to]) => isAllowed(from, to)))(
      "%s → %s は許可する",
      (from, to) => {
        expect(isAllowedSettlementTransition(from, to)).toBe(true);
      }
    );

    it.each(ALL_PAIRS.filter(([from, to]) => !isAllowed(from, to)))(
      "%s → %s は拒否する",
      (from, to) => {
        expect(isAllowedSettlementTransition(from, to)).toBe(false);
      }
    );
  });

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

    it.each(["pending_payment", "invoice_sent"] as const)(
      "%s からpaidにできる",
      (status) => {
        expect(makeSettlement({ status }).markPaid(new Date()).status).toBe(
          "paid"
        );
      }
    );

    // paid → paid（Webhookの再配信）もdomainでは拒否する。冪等性はuse-case側で扱う
    it.each(["limit_exceeded", "paid", "cancelled"] as const)(
      "%s からはInvalidStatusTransitionErrorを投げる",
      (status) => {
        const settlement = makeSettlement({ status });
        expect(() => settlement.markPaid(new Date())).toThrow(
          InvalidStatusTransitionError
        );
        expect(() => settlement.markPaid(new Date())).toThrow(
          `${status} → paid`
        );
      }
    );
  });

  describe("cancel()", () => {
    it("statusをcancelledにしcancelledAtを設定する", () => {
      const at = new Date(2026, 8, 21);
      const cancelled = makeSettlement().cancel(at);
      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelledAt).toBe(at);
    });

    it.each(["pending_payment", "invoice_sent", "limit_exceeded"] as const)(
      "%s からcancelledにできる",
      (status) => {
        expect(makeSettlement({ status }).cancel(new Date()).status).toBe(
          "cancelled"
        );
      }
    );

    // paidのキャンセル（返金）はreturnsのフローで扱う
    it.each(["paid", "cancelled"] as const)(
      "%s からはInvalidStatusTransitionErrorを投げる",
      (status) => {
        const settlement = makeSettlement({ status });
        expect(() => settlement.cancel(new Date())).toThrow(
          InvalidStatusTransitionError
        );
        expect(() => settlement.cancel(new Date())).toThrow(
          `${status} → cancelled`
        );
      }
    );
  });

  describe("状態の判定", () => {
    it.each([
      ["pending_payment", false, false, false, false],
      ["invoice_sent", false, false, false, true],
      ["limit_exceeded", false, false, true, true],
      ["paid", true, false, false, false],
      ["cancelled", false, true, false, false],
    ] as const)(
      "%s: isPaid=%s isCancelled=%s isLimitExceeded=%s isUnresolved=%s",
      (status, paid, cancelled, limitExceeded, unresolved) => {
        const settlement = makeSettlement({ status });
        expect(settlement.isPaid()).toBe(paid);
        expect(settlement.isCancelled()).toBe(cancelled);
        expect(settlement.isLimitExceeded()).toBe(limitExceeded);
        expect(settlement.isUnresolved()).toBe(unresolved);
      }
    );
  });
});
