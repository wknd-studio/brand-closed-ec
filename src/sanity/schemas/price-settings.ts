import { defineField, defineType } from "sanity";

import { PRICING_RANK_OPTIONS } from "./rank-options";

export const priceSettings = defineType({
  name: "priceSettings",
  title: "価格設定（デフォルト掛け率）",
  type: "document",
  description:
    "全商品共通のランク別デフォルト掛け率。このドキュメントは1件のみ作成してください",
  fields: [
    defineField({
      name: "default_rates",
      title: "ランク別デフォルト掛け率（%）",
      description: "定価に対する掛け率。商品ごとに個別上書き可能",
      type: "object",
      fields: PRICING_RANK_OPTIONS.map((rank) =>
        defineField({
          name: rank.value,
          title: rank.title,
          type: "number",
          validation: (r) => r.min(0).max(100),
        })
      ),
    }),
  ],
  preview: {
    prepare: () => ({ title: "価格設定（デフォルト掛け率）" }),
  },
});
