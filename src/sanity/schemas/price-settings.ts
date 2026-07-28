import { defineField, defineType } from "sanity";

import { PRICING_RANK_OPTIONS } from "./rank-options";
import { validateSingleDefaultPriceSettings } from "./product-price-calculator";

const API_VERSION = "2026-05-17";

export const priceSettings = defineType({
  name: "priceSettings",
  title: "掛け率設定",
  type: "document",
  description:
    "ランク別デフォルト掛け率のプリセット。商品・ブランドにアタッチして使い分けられます。未アタッチの商品には「デフォルト」に指定した1件が適用されます",
  fields: [
    defineField({
      name: "name",
      title: "設定名",
      description: "Studio上で識別するための名前（会員には表示されません）",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "is_default",
      title: "デフォルトにする",
      description:
        "商品・ブランドどちらにもアタッチされていない商品に適用されます。デフォルトにできるのは1件のみです",
      type: "boolean",
      initialValue: false,
      validation: (r) =>
        r.custom(async (isDefault, context) => {
          if (!isDefault) return true;

          const client = context.getClient({ apiVersion: API_VERSION });
          const baseId = (context.document?._id ?? "").replace(/^drafts\./, "");
          const otherDefaultCount = await client.fetch<number>(
            `count(*[_type=="priceSettings"&&is_default==true&&!(_id in [$baseId,$draftId])])`,
            { baseId, draftId: `drafts.${baseId}` }
          );

          return validateSingleDefaultPriceSettings(
            isDefault,
            otherDefaultCount
          );
        }),
    }),
    defineField({
      name: "default_rates",
      title: "ランク別掛け率（%）",
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
    select: { title: "name", isDefault: "is_default" },
    prepare: ({ title, isDefault }) => ({
      title: isDefault ? `${title}（デフォルト）` : title,
    }),
  },
});
