import { defineField, defineType } from "sanity";

import { createPlaceholderTextInput } from "./placeholder-text-input";
import { CsvColumnMappingInput } from "./csv-column-mapping-input";

/**
 * 商品データ1カタログ分のCSV取り込み設定（specs/004-product-data-import）。
 * CSV提供業者・スクレイピング対象業者のどちらも、書き込み前に必ずCSVを経由する
 * （スクレイピング側はCSV生成後、既存のCSVインポート画面から取り込む設計。
 * ユーザーとの協議によりscrapingCatalogを廃止しこの型へ統合）。
 * スクレイピング対象の場合、対象URL・実行コードはSanityではなく開発者が
 * 用意するアダプターコード（scripts/product-import/vendors/<id>/scraper.ts）側で
 * 管理し、このドキュメントの`_id`をアダプターのCATALOG_IDと一致させる。
 * ブランドは行（商品）ごとのデータであり、業者やcatalog単位で決め打ちできるとは限らないため、
 * 「1 catalog = 1 ブランド」という前提は置かない。default_brandはあくまで
 * 「この取り込みのデータにブランド情報が無い行への穴埋め」であり、CSVにブランド列があれば
 * 常にそちらが優先される。
 */
export const csvCatalog = defineType({
  name: "csvCatalog",
  title: "商品CSVカタログ",
  type: "document",
  fields: [
    defineField({
      name: "label",
      title: "表示名",
      description: "業者名や用途など、他のCSVデータソースと区別できる名前",
      type: "string",
      components: {
        input: createPlaceholderTextInput("例: A社 定期CSV（Nike分）"),
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "default_brand",
      title: "デフォルトブランド",
      description:
        "このCSVにブランド名の列（またはブランドが分かる情報）が無い場合に、商品へ設定する既定のブランド。" +
        "下のCSV列マッピングでブランド名列が設定されていれば、行ごとの値が優先される",
      type: "reference",
      to: [{ type: "brand" }],
    }),
    defineField({
      name: "header_row_number",
      title: "ヘッダー行の行番号",
      description:
        "CSVの先頭に案内文や空行があり、項目名（ヘッダー）が1行目でない場合に指定する（1始まり）。" +
        "下の「CSV列マッピング」でサンプルCSVをアップロードすると、プレビューから選択できる。通常は1のままでよい",
      type: "number",
      initialValue: 1,
      validation: (r) => r.min(1).integer(),
    }),
    defineField({
      name: "csv_column_mapping",
      title: "CSV列マッピング",
      description:
        "このCSVの列名を、各項目に対応付ける。対応する列が無い項目は空欄のままでよい",
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
            "列が無いCSVは空欄のままにし、上の「デフォルトブランド」を設定する",
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
            "定価に対する仕入れ支払い比率（%）。「掛け率」等の名称で提供される任意項目",
          type: "string",
        }),
        defineField({
          name: "case_quantity",
          title: "入数列名",
          type: "string",
        }),
      ],
      components: { input: CsvColumnMappingInput },
    }),
  ],
  preview: {
    select: { title: "label" },
    prepare({ title }) {
      return { title, subtitle: "CSV提供" };
    },
  },
});
