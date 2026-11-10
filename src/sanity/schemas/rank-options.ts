import { MemberRank } from "@/domain/value-objects/member-rank";

export const RANK_OPTIONS = [
  { title: "Starter", value: "starter" },
  { title: "Basic", value: "basic" },
  { title: "Standard", value: "standard" },
  { title: "Pro", value: "pro" },
  { title: "Advanced", value: "advanced" },
  { title: "Premium", value: "premium" },
  { title: "Enterprise", value: "enterprise" },
];

// 個別契約のランク（Enterprise）は、掛け率・価格の入力対象外
export const PRICING_RANK_OPTIONS = RANK_OPTIONS.filter((option) =>
  MemberRank.of(option.value).hasRankPricing()
);

// 掛け率・価格を入力しないランク（個別契約）
export const NON_PRICING_RANK_OPTIONS = RANK_OPTIONS.filter(
  (option) => !MemberRank.of(option.value).hasRankPricing()
);
