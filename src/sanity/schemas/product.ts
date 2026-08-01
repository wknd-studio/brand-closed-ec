import { defineField, defineType } from "sanity";

import { RANK_OPTIONS, PRICING_RANK_OPTIONS } from "./rank-options";
import { ProductPriceRateInput } from "./product-price-rate-input";
import { ProductPricesDisplay } from "./product-prices-display";
import { FormattedYenInput } from "./formatted-yen-input";

// Enterpriseランクは個別契約のため、固定価格商品でも価格入力の必須対象外
const REQUIRED_PRICE_RANKS = PRICING_RANK_OPTIONS.map((option) => option.value);

export function validatePrices(
  prices: Partial<Record<string, number>> | undefined,
  document: { is_negotiable?: boolean } | undefined
): string | true {
  if (document?.is_negotiable) return true;
  if (!prices) return "固定価格商品にはランク別価格の設定が必要です";

  const missingRanks = REQUIRED_PRICE_RANKS.filter(
    (rank) => prices[rank] == null
  );
  if (missingRanks.length > 0) {
    return `固定価格商品は以下のランクの価格が未入力です: ${missingRanks.join(", ")}`;
  }

  return true;
}

export const product = defineType({
  name: "product",
  title: "商品",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "商品名",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "brand",
      title: "ブランド",
      type: "reference",
      to: [{ type: "brand" }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: "categories",
      title: "カテゴリ",
      type: "array",
      of: [{ type: "reference", to: [{ type: "category" }] }],
    }),
    defineField({
      name: "description",
      title: "説明",
      type: "array",
      of: [{ type: "block" }],
    }),
    defineField({
      name: "images",
      title: "商品画像",
      type: "array",
      of: [
        {
          type: "image",
          options: { hotspot: true },
        },
      ],
    }),
    defineField({
      name: "files",
      title: "添付ファイル（スペックシート・仕様書 PDF 等）",
      type: "array",
      of: [
        {
          type: "file",
          fields: [
            defineField({
              name: "label",
              title: "ファイル名（表示用）",
              type: "string",
            }),
          ],
        },
      ],
    }),
    defineField({
      name: "retail_price",
      title: "参考小売価格（円）",
      description: "一般小売店での参考価格。商品カードに表示されます",
      type: "number",
      validation: (r) => r.required().min(0),
      components: { input: FormattedYenInput },
    }),
    defineField({
      name: "is_negotiable",
      title: "要相談商品",
      description:
        "ONの場合、価格は個別見積もりとなりInvoiceフローで処理されます",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "price_settings",
      title: "掛け率設定",
      description:
        "未アタッチの場合はブランドの掛け率設定、それもなければデフォルトの掛け率設定が使われます",
      type: "reference",
      to: [{ type: "priceSettings" }],
    }),
    defineField({
      name: "price_rates",
      title: "ランク別掛け率（%）",
      description:
        "定価に対する掛け率。空欄のランクはデフォルト掛け率が使われます。入力するとランク別仕入れ価格が自動計算されます",
      type: "object",
      fields: PRICING_RANK_OPTIONS.map((rank) =>
        defineField({
          name: rank.value,
          title: rank.title,
          type: "number",
          validation: (r) => r.min(0).max(100),
        })
      ),
      components: { input: ProductPriceRateInput },
    }),
    defineField({
      name: "prices",
      title: "ランク別仕入れ価格（円）",
      description:
        "掛け率から自動計算されます（直接編集不可）。要相談商品の場合は空欄で構いません",
      type: "object",
      readOnly: true,
      fields: [
        defineField({ name: "starter", title: "Starter", type: "number" }),
        defineField({ name: "basic", title: "Basic", type: "number" }),
        defineField({ name: "standard", title: "Standard", type: "number" }),
        defineField({ name: "pro", title: "Pro", type: "number" }),
        defineField({ name: "advanced", title: "Advanced", type: "number" }),
        defineField({ name: "premium", title: "Premium", type: "number" }),
        defineField({
          name: "enterprise",
          title: "Enterprise",
          type: "number",
        }),
      ],
      validation: (r) =>
        r.custom((prices, { document }) =>
          validatePrices(
            prices as Partial<Record<string, number>> | undefined,
            document as { is_negotiable?: boolean } | undefined
          )
        ),
      components: { input: ProductPricesDisplay },
    }),
    defineField({
      name: "min_rank",
      title: "最低閲覧ランク",
      description: "このランク未満の会員には商品が表示されません",
      type: "string",
      options: { list: RANK_OPTIONS },
      initialValue: "starter",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "availability",
      title: "在庫状況",
      type: "string",
      options: {
        list: [
          { title: "取り扱い中", value: "available" },
          { title: "在庫切れ", value: "out_of_stock" },
          { title: "取り扱い終了", value: "discontinued" },
        ],
      },
      initialValue: "available",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "jan_code",
      title: "JANコード",
      description:
        "業者商品データインポートでの重複判定キー（specs/004-product-data-import）。提供されない業者もあるため任意項目",
      type: "string",
    }),
    defineField({
      name: "source_vendor",
      title: "データ取得元業者",
      description: "業者商品データインポートで作成・更新された場合の取得元業者",
      type: "reference",
      to: [{ type: "vendor" }],
    }),
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "brand.name",
      media: "images",
    },
    prepare({ title, subtitle, media }) {
      // preview.select.mediaへの配列インデックス指定（images.0）はSanityの既知の不具合で
      // 常にundefinedになるため、配列ごと取得しprepare側で先頭要素を取り出す
      // (https://github.com/sanity-io/sanity/issues/4107)
      return {
        title,
        subtitle,
        media: Array.isArray(media) ? media[0] : undefined,
      };
    },
  },
});
