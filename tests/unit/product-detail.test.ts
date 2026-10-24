import { describe, it, expect } from "vitest";
import { MemberRank, RANK_ORDER } from "@/domain/value-objects/member-rank";

// 商品詳細ページ・お気に入り一覧の閲覧可否は MemberRank.canAccess で判定する
describe("MemberRank.canAccess()（全ランク × 最低ランク）", () => {
  const combinations = RANK_ORDER.flatMap((userRank, userIdx) =>
    RANK_ORDER.map(
      (minRank, minIdx) => [userRank, minRank, userIdx >= minIdx] as const
    )
  );

  it("49通りすべてを網羅している", () => {
    expect(combinations).toHaveLength(49);
  });

  it.each(combinations)(
    "会員ランク %s・最低ランク %s → %s",
    (userRank, minRank, expected) => {
      expect(MemberRank.of(userRank).canAccess(MemberRank.of(minRank))).toBe(
        expected
      );
    }
  );

  it("不明な最低ランクは MemberRank.of の時点でエラーになる", () => {
    expect(() =>
      MemberRank.of("enterprise").canAccess(MemberRank.of("unknown"))
    ).toThrow("不正なランク値");
  });
});
