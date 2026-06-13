import { describe, it, expect } from "vitest";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

describe("MonthlyPeriod", () => {
  describe("fromSubscribedAt() — subscribedAt が null の場合", () => {
    it("当月1日〜翌月1日の期間を返す", () => {
      const now = new Date(2026, 5, 15); // 2026-06-15
      const period = MonthlyPeriod.fromSubscribedAt(null, now);
      expect(period.start).toEqual(new Date(2026, 5, 1));
      expect(period.end).toEqual(new Date(2026, 6, 1));
    });
  });

  describe("fromSubscribedAt() — subscribedAt が月中の場合", () => {
    it("今日が開始日以降なら当月開始日〜翌月同日", () => {
      // 購読日が10日、今日が6/15 → 6/10〜7/10
      const subscribedAt = new Date(2026, 0, 10);
      const now = new Date(2026, 5, 15);
      const period = MonthlyPeriod.fromSubscribedAt(subscribedAt, now);
      expect(period.start).toEqual(new Date(2026, 5, 10));
      expect(period.end).toEqual(new Date(2026, 6, 10));
    });

    it("今日が開始日より前なら前月同日〜当月同日", () => {
      // 購読日が20日、今日が6/15 → 5/20〜6/20
      const subscribedAt = new Date(2026, 0, 20);
      const now = new Date(2026, 5, 15);
      const period = MonthlyPeriod.fromSubscribedAt(subscribedAt, now);
      expect(period.start).toEqual(new Date(2026, 4, 20));
      expect(period.end).toEqual(new Date(2026, 5, 20));
    });

    it("今日がちょうど開始日なら当月開始日〜翌月同日", () => {
      const subscribedAt = new Date(2026, 0, 10);
      const now = new Date(2026, 5, 10);
      const period = MonthlyPeriod.fromSubscribedAt(subscribedAt, now);
      expect(period.start).toEqual(new Date(2026, 5, 10));
      expect(period.end).toEqual(new Date(2026, 6, 10));
    });
  });

  describe("contains()", () => {
    it("期間内の日付はtrue", () => {
      const subscribedAt = new Date(2026, 0, 10);
      const now = new Date(2026, 5, 15);
      const period = MonthlyPeriod.fromSubscribedAt(subscribedAt, now);
      expect(period.contains(new Date(2026, 5, 10))).toBe(true);
      expect(period.contains(new Date(2026, 5, 30))).toBe(true);
    });

    it("開始日はtrue（境界値）", () => {
      const period = MonthlyPeriod.fromSubscribedAt(
        null,
        new Date(2026, 5, 15)
      );
      expect(period.contains(new Date(2026, 5, 1))).toBe(true);
    });

    it("終了日はfalse（境界値: 終了は exclusive）", () => {
      const period = MonthlyPeriod.fromSubscribedAt(
        null,
        new Date(2026, 5, 15)
      );
      expect(period.contains(new Date(2026, 6, 1))).toBe(false);
    });

    it("期間外の日付はfalse", () => {
      const period = MonthlyPeriod.fromSubscribedAt(
        null,
        new Date(2026, 5, 15)
      );
      expect(period.contains(new Date(2026, 4, 31))).toBe(false);
    });
  });
});
