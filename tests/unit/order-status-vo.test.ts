import { describe, it, expect } from "vitest";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { InvalidStatusTransitionError } from "@/domain/errors/invalid-status-transition-error";

describe("OrderStatus", () => {
  describe("of()", () => {
    it("有効な値を受け付ける", () => {
      expect(OrderStatus.of("paid").value).toBe("paid");
    });

    it("無効な値はエラーになる", () => {
      expect(() => OrderStatus.of("unknown")).toThrow();
    });
  });

  describe("canAdvance() — admin が手動で進める遷移", () => {
    it.each(["paid", "sourcing", "ordered", "preparing", "shipping"])(
      "%s はtrue",
      (status) => {
        expect(OrderStatus.of(status).canAdvance()).toBe(true);
      }
    );

    it.each([
      "pending_payment",
      "confirming",
      "limit_exceeded",
      "invoice_sent",
      "delivered",
      "cancelled",
    ])("%s はfalse", (status) => {
      expect(OrderStatus.of(status).canAdvance()).toBe(false);
    });
  });

  describe("next()", () => {
    it.each([
      ["paid", "sourcing"],
      ["sourcing", "ordered"],
      ["ordered", "preparing"],
      ["preparing", "shipping"],
      ["shipping", "delivered"],
    ] as const)("%s → %s", (from, to) => {
      expect(OrderStatus.of(from).next().value).toBe(to);
    });

    it("canAdvance() が false のステータスは InvalidStatusTransitionError", () => {
      expect(() => OrderStatus.of("pending_payment").next()).toThrow(
        InvalidStatusTransitionError
      );
    });
  });

  describe("isTerminal()", () => {
    it.each(["delivered", "cancelled"])("%s はtrue", (status) => {
      expect(OrderStatus.of(status).isTerminal()).toBe(true);
    });

    it("paid はfalse", () => {
      expect(OrderStatus.of("paid").isTerminal()).toBe(false);
    });
  });

  describe("isCancellable()", () => {
    it.each([
      "pending_payment",
      "confirming",
      "limit_exceeded",
      "invoice_sent",
    ])("%s はtrue", (status) => {
      expect(OrderStatus.of(status).isCancellable()).toBe(true);
    });

    it.each([
      "paid",
      "sourcing",
      "ordered",
      "preparing",
      "shipping",
      "delivered",
      "cancelled",
    ])("%s はfalse", (status) => {
      expect(OrderStatus.of(status).isCancellable()).toBe(false);
    });
  });

  describe("equals()", () => {
    it("同じ値はtrue", () => {
      expect(OrderStatus.of("paid").equals(OrderStatus.of("paid"))).toBe(true);
    });

    it("異なる値はfalse", () => {
      expect(OrderStatus.of("paid").equals(OrderStatus.of("sourcing"))).toBe(
        false
      );
    });
  });
});
