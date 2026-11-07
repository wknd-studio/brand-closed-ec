import { describe, it, expect } from "vitest";
import { RankPrices } from "@/domain/value-objects/rank-prices";
import { MemberRank, RANK_ORDER } from "@/domain/value-objects/member-rank";

const fullPrices = {
  starter: 7000,
  basic: 6000,
  standard: 5000,
  pro: 4000,
  advanced: 3000,
  premium: 2000,
  enterprise: 1000,
};

describe("RankPrices.priceFor()", () => {
  it.each(RANK_ORDER.map((rank) => [rank, fullPrices[rank]] as const))(
    "%s ランクには %d 円の価格を返す",
    (rank, expected) => {
      const prices = RankPrices.of({ isNegotiable: false, prices: fullPrices });
      expect(prices.priceFor(MemberRank.of(rank))?.amount).toBe(expected);
    }
  );

  it("要相談の商品は価格が設定されていても null を返す", () => {
    const prices = RankPrices.of({ isNegotiable: true, prices: fullPrices });
    for (const rank of RANK_ORDER) {
      expect(prices.priceFor(MemberRank.of(rank))).toBeNull();
    }
  });

  it("そのランクの価格が未設定なら null を返す", () => {
    const prices = RankPrices.of({
      isNegotiable: false,
      prices: { starter: 7000 },
    });
    expect(prices.priceFor(MemberRank.of("starter"))?.amount).toBe(7000);
    expect(prices.priceFor(MemberRank.of("basic"))).toBeNull();
  });

  it("価格表そのものが null なら null を返す", () => {
    const prices = RankPrices.of({ isNegotiable: false, prices: null });
    expect(prices.priceFor(MemberRank.of("starter"))).toBeNull();
  });

  it("価格 0 円は未設定と区別して 0 を返す", () => {
    const prices = RankPrices.of({
      isNegotiable: false,
      prices: { starter: 0 },
    });
    expect(prices.priceFor(MemberRank.of("starter"))?.amount).toBe(0);
  });

  it("isNegotiable を公開する", () => {
    expect(
      RankPrices.of({ isNegotiable: true, prices: null }).isNegotiable
    ).toBe(true);
  });
});
