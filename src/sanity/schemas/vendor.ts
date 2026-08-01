import { defineField, defineType } from "sanity";

export const vendor = defineType({
  name: "vendor",
  title: "業者",
  type: "document",
  fields: [
    defineField({
      name: "name",
      title: "業者名",
      type: "string",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "data_source_type",
      title: "データ提供区分",
      description:
        "CSVで商品データを提供してくれる業者か、サイト注文のみでスクレイピングによる収集が必要な業者か",
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
      name: "is_contracted",
      title: "取引契約あり",
      description:
        "trueの業者のみ自動収集（スクレイピング）の対象になる（FR-009）",
      type: "boolean",
      initialValue: false,
    }),
    defineField({
      name: "default_brand",
      title: "デフォルトブランド",
      description:
        "この業者のCSVにブランド名の列が無い場合に使う固定のブランド。" +
        "CSVにブランド列（csv_column_mapping.brand_name）があればそちらが優先される",
      type: "reference",
      to: [{ type: "brand" }],
    }),
    defineField({
      name: "csv_column_mapping",
      title: "CSV列マッピング",
      description:
        "この業者のCSVの列名 → 統一データ形式フィールドの対応（data_source_type: csvの場合のみ使用）",
      type: "object",
      fields: [
        defineField({
          name: "jan_code",
          title: "JANコード列名",
          type: "string",
        }),
        defineField({ name: "name", title: "商品名列名", type: "string" }),
        defineField({
          name: "brand_name",
          title: "ブランド名列名",
          description:
            "列が無い業者は空欄のままにし、デフォルトブランドを設定する",
          type: "string",
        }),
        defineField({
          name: "retail_price",
          title: "定価列名",
          type: "string",
        }),
        defineField({
          name: "availability",
          title: "在庫状況列名",
          type: "string",
        }),
        defineField({
          name: "vendor_cost_rate",
          title: "仕入れ掛け率列名",
          description:
            "定価に対する仕入れ支払い比率（%）。業者により「掛け率」等の名称で提供される任意項目",
          type: "string",
        }),
        defineField({
          name: "case_quantity",
          title: "入数列名",
          type: "string",
        }),
      ],
      hidden: ({ document }) => document?.data_source_type !== "csv",
    }),
    defineField({
      name: "scrape_target_url",
      title: "スクレイピング対象URL",
      description: "data_source_type: scrapingの場合のみ使用",
      type: "url",
      hidden: ({ document }) => document?.data_source_type !== "scraping",
    }),
    defineField({
      name: "scrape_adapter_id",
      title: "スクレイピングアダプターID",
      description:
        "scripts/product-import/vendors/<id>/ に対応する識別子。data_source_type: scrapingの場合のみ使用",
      type: "string",
      hidden: ({ document }) => document?.data_source_type !== "scraping",
    }),
  ],
  preview: {
    select: {
      title: "name",
      subtitle: "data_source_type",
    },
  },
});
