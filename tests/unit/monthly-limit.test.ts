import { describe, it, expect } from "vitest";
import { MonthlyLimit } from "@/domain/value-objects/monthly-limit";
import { Money } from "@/domain/value-objects/money";

describe("MonthlyLimit", () => {
  describe("fromNullable()", () => {
    it("金額があれば、その金額の上限にする", () => {
      const limit = MonthlyLimit.fromNullable(300_000);

      expect(limit.isUnlimited()).toBe(false);
      expect(limit.amount).toBe(300_000);
    });

    it("NULL は無制限にする（member_ranks.monthly_limit_amount の NULL = 無制限）", () => {
      const limit = MonthlyLimit.fromNullable(null);

      expect(limit.isUnlimited()).toBe(true);
      expect(limit.amount).toBeNull();
    });

    it("0 は無制限ではなく上限0として扱う", () => {
      const limit = MonthlyLimit.fromNullable(0);

      expect(limit.isUnlimited()).toBe(false);
      expect(limit.amount).toBe(0);
    });

    it("負の金額・整数でない金額は作れない", () => {
      expect(() => MonthlyLimit.fromNullable(-1)).toThrow();
      expect(() => MonthlyLimit.fromNullable(1.5)).toThrow();
    });
  });

  describe("of() / unlimited()", () => {
    it("of() は金額の上限、unlimited() は無制限を作る", () => {
      expect(MonthlyLimit.of(1_000).amount).toBe(1_000);
      expect(MonthlyLimit.unlimited().isUnlimited()).toBe(true);
    });
  });

  describe("isExceededBy()", () => {
    it("上限を超える金額なら true", () => {
      expect(MonthlyLimit.of(100_000).isExceededBy(Money.of(100_001))).toBe(
        true
      );
    });

    it("ちょうど上限と同額なら false", () => {
      expect(MonthlyLimit.of(100_000).isExceededBy(Money.of(100_000))).toBe(
        false
      );
    });

    it("上限0なら1円でも超過", () => {
      expect(MonthlyLimit.of(0).isExceededBy(Money.of(1))).toBe(true);
    });

    it("無制限ならどれだけ大きな金額でも超過しない", () => {
      expect(
        MonthlyLimit.unlimited().isExceededBy(Money.of(Number.MAX_SAFE_INTEGER))
      ).toBe(false);
    });
  });

  describe("remainingAfter()", () => {
    it("上限から使った金額を引いた残りを返す。超過していれば負", () => {
      expect(MonthlyLimit.of(100_000).remainingAfter(Money.of(30_000))).toBe(
        70_000
      );
      expect(MonthlyLimit.of(100_000).remainingAfter(Money.of(130_000))).toBe(
        -30_000
      );
    });

    it("無制限なら null", () => {
      expect(
        MonthlyLimit.unlimited().remainingAfter(Money.of(30_000))
      ).toBeNull();
    });
  });
});
