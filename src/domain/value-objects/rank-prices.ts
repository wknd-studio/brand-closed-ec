import { Money } from "./money";
import type { MemberRank, MemberRankValue } from "./member-rank";

/** 商品のランク別価格表 */
export class RankPrices {
  private constructor(
    readonly isNegotiable: boolean,
    private readonly prices: Partial<Record<MemberRankValue, number>>
  ) {}

  static of({
    isNegotiable,
    prices,
  }: {
    isNegotiable: boolean;
    prices: Partial<Record<MemberRankValue, number>> | null;
  }): RankPrices {
    return new RankPrices(isNegotiable, prices ?? {});
  }

  /** 会員ランクの価格。要相談、またはそのランクの価格が未設定ならnull */
  priceFor(rank: MemberRank): Money | null {
    if (this.isNegotiable) return null;
    const price = this.prices[rank.value];
    return price == null ? null : Money.of(price);
  }
}
