import { describe, it, expect } from "vitest";
import { Money } from "@/domain/value-objects/money";

describe("Money", () => {
  describe("of()", () => {
    it("負の金額は作れない", () => {
      expect(() => Money.of(-1)).toThrow();
    });
    it("0は作れる", () => {
      expect(Money.of(0).amount).toBe(0);
    });
    it.each([0.5, 100.1, Number.NaN, Number.POSITIVE_INFINITY])(
      "円の整数でない金額（%s）は作れない",
      (amount) => {
        expect(() => Money.of(amount)).toThrow();
      }
    );
  });

  describe("add()", () => {
    it("金額を加算する", () => {
      expect(Money.of(100).add(Money.of(200)).amount).toBe(300);
    });
  });

  describe("isOver()", () => {
    it("上限を超えている場合はtrue", () => {
      expect(Money.of(1001).isOver(Money.of(1000))).toBe(true);
    });
    it("上限と同額はfalse（超過ではない）", () => {
      expect(Money.of(1000).isOver(Money.of(1000))).toBe(false);
    });
    it("上限以下はfalse", () => {
      expect(Money.of(999).isOver(Money.of(1000))).toBe(false);
    });
  });

  describe("isZero()", () => {
    it("0のときtrue", () => {
      expect(Money.of(0).isZero()).toBe(true);
    });
    it("0でないときfalse", () => {
      expect(Money.of(1).isZero()).toBe(false);
    });
  });
});
