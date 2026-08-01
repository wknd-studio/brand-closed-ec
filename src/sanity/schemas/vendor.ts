import { defineField, defineType } from "sanity";

import { createPlaceholderTextInput } from "./placeholder-text-input";

export const vendor = defineType({
  name: "vendor",
  title: "業者",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "業者名",
      description: "Sanity Studio上での表示名（社内で分かればよい）",
      type: "string",
      components: {
        input: createPlaceholderTextInput("例: 株式会社サンプル商事"),
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "data_source_type",
      title: "データ提供区分",
      description:
        "CSVで商品データを提供してくれる業者は「CSV提供」、業者のサイト上で注文する形式で" +
        "機械可読なデータが無い業者は「スクレイピング対象」を選ぶ",
      type: "string",
      options: {
        list: [
          { title: "CSV提供", value: "csv" },
          { title: "スクレイピング対象", value: "scraping" },
        ],
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "default_brand",
      title: "デフォルトブランド",
      description:
        "この業者のCSVにブランド名の列が無い場合に、商品へ自動的に設定する固定のブランド。" +
        "CSVにブランド列（下の「CSV列マッピング」内のブランド名列名）が設定されていれば、そちらが優先される",
      type: "reference",
      to: [{ type: "brand" }],
    }),
    defineField({
      name: "csv_column_mapping",
      title: "CSV列マッピング",
      description:
        "この業者から届くCSVファイルの列名を、各項目に入力する。" +
        "例えばCSVの商品名の列見出しが「品名」なら、「商品名列名」に「品名」と入力する。" +
        "対応する列が無い項目は空欄のままでよい（「CSV提供」の場合のみ使用）",
      type: "object",
      fields: [
        defineField({
          name: "jan_code",
          title: "JANコード列名",
          type: "string",
          components: { input: createPlaceholderTextInput("例: JAN") },
        }),
        defineField({
          name: "name",
          title: "商品名列名",
          type: "string",
          components: { input: createPlaceholderTextInput("例: 商品名") },
        }),
        defineField({
          name: "brand_name",
          title: "ブランド名列名",
          description:
            "列が無い業者は空欄のままにし、上の「デフォルトブランド」を設定する",
          type: "string",
          components: { input: createPlaceholderTextInput("例: ブランド") },
        }),
        defineField({
          name: "retail_price",
          title: "定価列名",
          type: "string",
          components: { input: createPlaceholderTextInput("例: 定価") },
        }),
        defineField({
          name: "availability",
          title: "在庫状況列名",
          type: "string",
          components: { input: createPlaceholderTextInput("例: 在庫") },
        }),
        defineField({
          name: "vendor_cost_rate",
          title: "仕入れ掛け率列名",
          description:
            "定価に対する仕入れ支払い比率（%）。業者により「掛け率」等の名称で提供される任意項目",
          type: "string",
          components: { input: createPlaceholderTextInput("例: 掛け率") },
        }),
        defineField({
          name: "case_quantity",
          title: "入数列名",
          type: "string",
          components: { input: createPlaceholderTextInput("例: 入数") },
        }),
      ],
      hidden: ({ document }) => document?.data_source_type !== "csv",
    }),
    defineField({
      name: "scrape_target_url",
      title: "スクレイピング対象URL",
      description:
        "業者サイト上で商品一覧が見られるページのURL（「スクレイピング対象」の場合のみ使用）",
      type: "url",
      components: {
        input: createPlaceholderTextInput(
          "例: https://vendor-example.com/products"
        ),
      },
      hidden: ({ document }) => document?.data_source_type !== "scraping",
    }),
    defineField({
      name: "scrape_adapter_id",
      title: "スクレイピングアダプターID",
      description:
        "開発者が用意した、この業者専用の収集プログラムの識別子。" +
        "「スクレイピング対象」の場合のみ使用し、開発者に確認して入力する",
      type: "string",
      components: {
        input: createPlaceholderTextInput("例: vendor-example"),
      },
      hidden: ({ document }) => document?.data_source_type !== "scraping",
    }),
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "data_source_type",
    },
    prepare({ title, subtitle }) {
      return {
        title,
        subtitle:
          subtitle === "csv"
            ? "CSV提供"
            : subtitle === "scraping"
              ? "スクレイピング対象"
              : "データ提供区分 未設定",
      };
    },
  },
});
