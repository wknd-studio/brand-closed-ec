import { describe, it, expect } from "vitest";
import { MinimumMembershipPeriod } from "@/domain/value-objects/minimum-membership-period";

// 入会から6ヶ月の最低利用期間（docs/domain/membership.md）。User.withdraw の判定と、
// アカウント設定の退会欄の表示（#724）が同じ計算を使う
describe("MinimumMembershipPeriod", () => {
  describe("withdrawableFrom", () => {
    it.each([
      [
        "入会がJSTの0時台（UTCでは前日）",
        "2026-05-14T15:30:00Z",
        "2026-11-14T15:00:00Z",
      ],
      ["入会がJSTの23時台", "2026-05-15T14:59:00Z", "2026-11-14T15:00:00Z"],
      [
        "6ヶ月後の月に同じ日が無ければ月末（JST 2026-08-31 → 2027-02-28）",
        "2026-08-30T15:00:00Z",
        "2027-02-27T15:00:00Z",
      ],
    ])(
      "入会日（JST）の6ヶ月後の同じ日の0時（JST）: %s",
      (_, joinedAt, withdrawableFrom) => {
        expect(
          MinimumMembershipPeriod.startingAt(new Date(joinedAt))
            .withdrawableFrom
        ).toEqual(new Date(withdrawableFrom));
      }
    );
  });

  describe("includes()", () => {
    // JST 2026-05-15 00:30 に入会 → JST 2026-11-15 00:00 から退会できる
    const period = MinimumMembershipPeriod.startingAt(
      new Date("2026-05-14T15:30:00Z")
    );

    it("退会できるようになる日時の直前までは期間内", () => {
      expect(period.includes(new Date("2026-11-14T14:59:59.999Z"))).toBe(true);
    });

    it("退会できるようになる日時からは期間外", () => {
      expect(period.includes(new Date("2026-11-14T15:00:00Z"))).toBe(false);
    });
  });
});
