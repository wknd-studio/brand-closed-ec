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
  describe("toBillingAnchorDay() — 契約開始日時をJSTの日付にして起算日を決める", () => {
    it("JSTの0時〜9時（UTCでは前日）は、JSTの日付を使う", () => {
      // JST 3/1 05:00 = UTC 2/28 20:00
      expect(
        MonthlyPeriod.toBillingAnchorDay(new Date("2026-02-28T20:00:00Z"))
      ).toBe(1);
      // JST 3/15 00:00 = UTC 3/14 15:00
      expect(
        MonthlyPeriod.toBillingAnchorDay(new Date("2026-03-14T15:00:00Z"))
      ).toBe(15);
      // JST 3/15 08:59 = UTC 3/14 23:59
      expect(
        MonthlyPeriod.toBillingAnchorDay(new Date("2026-03-14T23:59:59Z"))
      ).toBe(15);
    });

    it("JSTの9時以降（UTCでも同じ日）は、その日付を使う", () => {
      // JST 3/15 09:00 = UTC 3/15 00:00
      expect(
        MonthlyPeriod.toBillingAnchorDay(new Date("2026-03-15T00:00:00Z"))
      ).toBe(15);
      // JST 3/15 23:59 = UTC 3/15 14:59
      expect(
        MonthlyPeriod.toBillingAnchorDay(new Date("2026-03-15T14:59:59Z"))
      ).toBe(15);
    });

    it("JSTで29〜31日なら28に丸める", () => {
      // JST 1/29 00:00 = UTC 1/28 15:00（UTCでは28日だがJSTでは29日）
      expect(
        MonthlyPeriod.toBillingAnchorDay(new Date("2026-01-28T15:00:00Z"))
      ).toBe(28);
      // JST 1/31 12:00
      expect(
        MonthlyPeriod.toBillingAnchorDay(new Date("2026-01-31T03:00:00Z"))
      ).toBe(28);
    });

    it("UTCでは月末だがJSTでは翌月1日なら1にする", () => {
      // JST 2/1 03:00 = UTC 1/31 18:00
      expect(
        MonthlyPeriod.toBillingAnchorDay(new Date("2026-01-31T18:00:00Z"))
      ).toBe(1);
    });

    it("JSTで28日はそのまま28", () => {
      // JST 2/28 08:00 = UTC 2/27 23:00
      expect(
        MonthlyPeriod.toBillingAnchorDay(new Date("2026-02-27T23:00:00Z"))
      ).toBe(28);
    });
  });
});
