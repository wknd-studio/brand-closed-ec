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

  describe("selfServiceRanks()", () => {
    it("セルフサービスで選べるのは、個別契約のenterpriseを除くランク（下位から順）", () => {
      expect(MemberRank.selfServiceRanks()).toEqual([
        "starter",
        "basic",
        "standard",
        "pro",
        "advanced",
        "premium",
      ]);
    });
  });

  describe("isSelfService()", () => {
    it("セルフサービスで選べるランクはtrue、個別契約のenterpriseはfalse", () => {
      expect(MemberRank.of("starter").isSelfService()).toBe(true);
      expect(MemberRank.of("premium").isSelfService()).toBe(true);
      expect(MemberRank.of("enterprise").isSelfService()).toBe(false);
    });
  });

  describe("pricingRanks()", () => {
    it("掛け率・ランク別価格を設定するのは、個別契約のenterpriseを除くランク（下位から順）", () => {
      expect(MemberRank.pricingRanks()).toEqual([
        "starter",
        "basic",
        "standard",
        "pro",
        "advanced",
        "premium",
      ]);
    });
  });

  describe("hasRankPricing()", () => {
    it("ランク別価格を設定するランクはtrue、個別契約のenterpriseはfalse", () => {
      expect(MemberRank.of("starter").hasRankPricing()).toBe(true);
      expect(MemberRank.of("premium").hasRankPricing()).toBe(true);
      expect(MemberRank.of("enterprise").hasRankPricing()).toBe(false);
    });
  });

  describe("of()", () => {
    it("旧ランク値（free, entry）は不正な値としてエラーになる", () => {
      expect(() => MemberRank.of("free")).toThrow();
      expect(() => MemberRank.of("entry")).toThrow();
    });
  });
});
