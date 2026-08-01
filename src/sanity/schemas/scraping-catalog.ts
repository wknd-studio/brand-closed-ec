import { defineField, defineType } from "sanity";

import { createPlaceholderTextInput } from "./placeholder-text-input";

/**
 * スクレイピング対象の商品データソース1本の設定（specs/004-product-data-import）。
 * スクレイピングは業者サイトごとにHTML構造が異なり、開発者が専用のコード
 * （scripts/product-import/vendors/<scrape_adapter_id>/scraper.ts）を実装しないと成立しない。
 * そのため、このドキュメントは開発者がコードと一緒に用意することを想定し、
 * Sanity Studio上では文字通りの「定数」として扱う。運営者は新規作成・編集・削除の
 * いずれもできず、閲覧のみ（sanity.config.tsのdocument.actions / newDocumentOptions
 * でpublish・delete・duplicate・新規作成をブロックし、加えて全フィールドをreadOnlyにする
 * 二重の防御）。内容の変更が必要な場合は開発者がコード（シードスクリプト等）で更新する。
 */
export const scrapingCatalog = defineType({
  name: "scrapingCatalog",
  title: "商品データソース（スクレイピング）",
  type: "document",
  fields: [
    defineField({
      name: "label",
      title: "表示名",
      description:
        "業者名や用途など、他のスクレイピングデータソースと区別できる名前",
      type: "string",
      components: {
        input: createPlaceholderTextInput("例: B社サイト スクレイピング"),
      },
      validation: (r) => r.required(),
      readOnly: true,
    }),
    defineField({
      name: "default_brand",
      title: "デフォルトブランド",
      description:
        "収集したデータにブランドが分かる情報が無い場合に、商品へ設定する既定のブランド",
      type: "reference",
      to: [{ type: "brand" }],
      readOnly: true,
    }),
    defineField({
      name: "scrape_target_url",
      title: "スクレイピング対象URL",
      description: "業者サイト上で商品一覧が見られるページのURL",
      type: "url",
      components: {
        input: createPlaceholderTextInput(
          "例: https://vendor-example.com/products"
        ),
      },
      validation: (r) => r.required(),
      readOnly: true,
    }),
    defineField({
      name: "scrape_adapter_id",
      title: "スクレイピングアダプターID",
      description:
        "開発者が用意した、このデータソース専用の収集プログラムの識別子。開発者に確認して入力する",
      type: "string",
      components: {
        input: createPlaceholderTextInput("例: vendor-example"),
      },
      validation: (r) => r.required(),
      readOnly: true,
    }),
  ],
  preview: {
    select: { title: "label" },
    prepare({ title }) {
      return { title, subtitle: "スクレイピング対象" };
    },
  },
});
