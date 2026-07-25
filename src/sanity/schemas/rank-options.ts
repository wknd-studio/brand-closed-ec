export const RANK_OPTIONS = [
  { title: "Starter", value: "starter" },
  { title: "Basic", value: "basic" },
  { title: "Standard", value: "standard" },
  { title: "Pro", value: "pro" },
  { title: "Advanced", value: "advanced" },
  { title: "Premium", value: "premium" },
  { title: "Enterprise", value: "enterprise" },
];

// Enterpriseランクは個別契約のため、掛け率・価格の入力対象外
export const PRICING_RANK_OPTIONS = RANK_OPTIONS.filter(
  (option) => option.value !== "enterprise"
);
