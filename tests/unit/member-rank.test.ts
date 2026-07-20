import { describe, it, expect } from "vitest";
import { MemberRank, RANK_ORDER } from "@/domain/value-objects/member-rank";

describe("MemberRank", () => {
  describe("getMonthlyLimit()", () => {
    it("starterは暫定値（TBD確定まで）が設定されている", () => {
      expect(MemberRank.of("starter").getMonthlyLimit().amount).toBeGreaterThan(
        0
      );
    });
    it("enterpriseは上限なし（MAX_SAFE_INTEGER）", () => {
      expect(MemberRank.of("enterprise").getMonthlyLimit().amount).toBe(
        Number.MAX_SAFE_INTEGER
      );
    });
    it("上位ランクほど上限額が大きい（enterprise除く）", () => {
      const nonEnterprise = RANK_ORDER.filter((r) => r !== "enterprise");
      for (let i = 1; i < nonEnterprise.length; i++) {
        const prev = MemberRank.of(nonEnterprise[i - 1]).getMonthlyLimit()
          .amount;
        const current = MemberRank.of(nonEnterprise[i]).getMonthlyLimit()
          .amount;
        expect(current).toBeGreaterThan(prev);
      }
    });
  });

  describe("canAccess()", () => {
    it("同ランクはアクセス可能", () => {
      expect(MemberRank.of("basic").canAccess(MemberRank.of("basic"))).toBe(
        true
      );
    });
    it("上位ランクは下位ランクにアクセス可能", () => {
      expect(MemberRank.of("pro").canAccess(MemberRank.of("starter"))).toBe(
        true
      );
    });
    it("下位ランクは上位ランクにアクセス不可", () => {
      expect(MemberRank.of("starter").canAccess(MemberRank.of("basic"))).toBe(
        false
      );
    });
  });

  describe("isHigherThan()", () => {
    it("上位ランクはtrue", () => {
      expect(
        MemberRank.of("standard").isHigherThan(MemberRank.of("basic"))
      ).toBe(true);
    });
    it("同ランクはfalse", () => {
      expect(MemberRank.of("basic").isHigherThan(MemberRank.of("basic"))).toBe(
        false
      );
    });
    it("下位ランクはfalse", () => {
      expect(MemberRank.of("starter").isHigherThan(MemberRank.of("pro"))).toBe(
        false
      );
    });
  });

  describe("RANK_ORDER", () => {
    it("順序が正しい（7ランク）", () => {
      expect(RANK_ORDER).toEqual([
        "starter",
        "basic",
        "standard",
        "pro",
        "advanced",
        "premium",
        "enterprise",
      ]);
    });
  });

  describe("of()", () => {
    it("旧ランク値（free, entry）は不正な値としてエラーになる", () => {
      expect(() => MemberRank.of("free")).toThrow();
      expect(() => MemberRank.of("entry")).toThrow();
    });
  });
});
