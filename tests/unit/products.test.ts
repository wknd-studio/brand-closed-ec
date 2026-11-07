import { describe, it, expect } from "vitest";
import { MemberRank } from "@/domain/value-objects/member-rank";

// 商品一覧のGROQ（min_rank in $allowedRanks）に渡す、閲覧できるランクの一覧
describe("MemberRank.accessibleRanks()", () => {
  it.each([
    ["starter", ["starter"]],
    ["basic", ["starter", "basic"]],
    ["standard", ["starter", "basic", "standard"]],
    ["pro", ["starter", "basic", "standard", "pro"]],
    ["advanced", ["starter", "basic", "standard", "pro", "advanced"]],
    ["premium", ["starter", "basic", "standard", "pro", "advanced", "premium"]],
    [
      "enterprise",
      [
        "starter",
        "basic",
        "standard",
        "pro",
        "advanced",
        "premium",
        "enterprise",
      ],
    ],
  ])("%s ランクは %j を閲覧できる", (rank, expected) => {
    expect(MemberRank.of(rank).accessibleRanks()).toEqual(expected);
  });

  it("返した配列を書き換えても次の呼び出しに影響しない", () => {
    const ranks = MemberRank.of("basic").accessibleRanks();
    ranks.push("enterprise");
    expect(MemberRank.of("basic").accessibleRanks()).toEqual([
      "starter",
      "basic",
    ]);
  });

  it("不明なランクは MemberRank.of の時点でエラーになる", () => {
    expect(() => MemberRank.of("unknown")).toThrow("不正なランク値");
  });
});
