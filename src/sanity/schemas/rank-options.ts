import {
  MemberRank,
  type MemberRankValue,
} from "@/domain/value-objects/member-rank";

// Sanity Studio でのランクの表示名
const RANK_TITLES: Record<MemberRankValue, string> = {
  starter: "Starter",
  basic: "Basic",
  standard: "Standard",
  pro: "Pro",
  advanced: "Advanced",
  premium: "Premium",
  enterprise: "Enterprise",
};

function toOption(value: MemberRankValue) {
  return { title: RANK_TITLES[value], value };
}

export const RANK_OPTIONS = MemberRank.allRanks().map(toOption);

// 個別契約のランク（Enterprise）は、掛け率・価格の入力対象外
export const PRICING_RANK_OPTIONS = MemberRank.pricingRanks().map(toOption);

// 掛け率・価格を入力しないランク（個別契約）
export const NON_PRICING_RANK_OPTIONS = RANK_OPTIONS.filter(
  (option) => !MemberRank.of(option.value).hasRankPricing()
);
