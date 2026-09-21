import { describe, it, expect } from "vitest";
import { OrderStatus } from "@/domain/value-objects/order-status";

// orders.statusは配下のorder_settlements・order_itemsから算出するロールアップ値
// （docs/domain/settlement.md）。値は4種類のみ。
describe("OrderStatus", () => {
  describe("of()", () => {
    it.each(["cancelled", "processing", "limit_exceeded", "paid"])(
      "%s を受け付ける",
      (status) => {
        expect(OrderStatus.of(status).value).toBe(status);
      }
    );

    it.each([
      "pending_approval",
      "pending_payment",
      "confirming",
      "invoice_sent",
      "sourcing",
      "ordered",
      "preparing",
      "shipping",
      "delivered",
      "unknown",
    ])("旧ステータス・不正値 %s はエラーになる", (status) => {
      expect(() => OrderStatus.of(status)).toThrow();
    });
  });

  describe("isTerminal()", () => {
    it("cancelled はtrue", () => {
      expect(OrderStatus.of("cancelled").isTerminal()).toBe(true);
    });

    it.each(["processing", "limit_exceeded", "paid"])(
      "%s はfalse",
      (status) => {
        expect(OrderStatus.of(status).isTerminal()).toBe(false);
      }
    );
  });

  describe("isCancellable()", () => {
    it.each(["processing", "limit_exceeded"])("%s はtrue", (status) => {
      expect(OrderStatus.of(status).isCancellable()).toBe(true);
    });

    it.each(["paid", "cancelled"])("%s はfalse", (status) => {
      expect(OrderStatus.of(status).isCancellable()).toBe(false);
    });
  });

  describe("equals()", () => {
    it("同じ値はtrue", () => {
      expect(OrderStatus.of("paid").equals(OrderStatus.of("paid"))).toBe(true);
    });

    it("異なる値はfalse", () => {
      expect(OrderStatus.of("paid").equals(OrderStatus.of("processing"))).toBe(
        false
      );
    });
  });
});
