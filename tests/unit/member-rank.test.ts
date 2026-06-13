import { describe, it, expect } from "vitest";
import { MemberRank, RANK_ORDER } from "@/domain/value-objects/member-rank";

describe("MemberRank", () => {
  describe("getMonthlyLimit()", () => {
    it("freeは300,000円", () => {
      expect(MemberRank.of("free").getMonthlyLimit().amount).toBe(300_000);
    });
    it("enterpriseは上限なし（MAX_SAFE_INTEGER）", () => {
      expect(MemberRank.of("enterprise").getMonthlyLimit().amount).toBe(
        Number.MAX_SAFE_INTEGER
      );
    });
  });

  describe("canAccess()", () => {
    it("同ランクはアクセス可能", () => {
      expect(MemberRank.of("entry").canAccess(MemberRank.of("entry"))).toBe(
        true
      );
    });
    it("上位ランクは下位ランクにアクセス可能", () => {
      expect(MemberRank.of("pro").canAccess(MemberRank.of("free"))).toBe(true);
    });
    it("下位ランクは上位ランクにアクセス不可", () => {
      expect(MemberRank.of("free").canAccess(MemberRank.of("entry"))).toBe(
        false
      );
    });
  });

  describe("isHigherThan()", () => {
    it("上位ランクはtrue", () => {
      expect(
        MemberRank.of("standard").isHigherThan(MemberRank.of("entry"))
      ).toBe(true);
    });
    it("同ランクはfalse", () => {
      expect(MemberRank.of("entry").isHigherThan(MemberRank.of("entry"))).toBe(
        false
      );
    });
    it("下位ランクはfalse", () => {
      expect(MemberRank.of("free").isHigherThan(MemberRank.of("pro"))).toBe(
        false
      );
    });
  });

  describe("RANK_ORDER", () => {
    it("順序が正しい", () => {
      expect(RANK_ORDER).toEqual([
        "free",
        "entry",
        "standard",
        "pro",
        "enterprise",
      ]);
    });
  });
});
