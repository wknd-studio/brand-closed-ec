import { defineField, defineType } from "sanity";

const STATUS_OPTIONS = [
  { title: "未対応", value: "pending" },
  { title: "取り扱い終了として承認", value: "approved_discontinued" },
  { title: "却下（販売継続中）", value: "dismissed" },
];

/**
 * 情報源（スクレイピング対象サイト）から消えたことを検知した商品を、
 * 担当者が確認・承認するまで保持する「要確認」キュー（FR-013, FR-014）。
 * 情報源から消えたことを検知しても即座にdiscontinuedにはせず、必ず担当者の
 * 確認・承認を経由させる（誤検知でまだ販売中の商品を取り扱い終了扱いにする
 * リスクを避けるため）。statusはドキュメントアクションからのみ更新され、
 * Studio上での直接編集は認めない（productImportRunと同じ理由: 監査ログとしての
 * 整合性を保つため）
 */
export const productAvailabilityReview = defineType({
  name: "productAvailabilityReview",
  title: "要確認（消失商品）",
  type: "document",
  fields: [
    defineField({
      name: "product",
      title: "対象商品",
      type: "reference",
      to: [{ type: "product" }],
      validation: (r) => r.required(),
      readOnly: true,
    }),
    defineField({
      name: "catalog",
      title: "対象カタログ",
      type: "reference",
      to: [{ type: "csvCatalog" }],
      validation: (r) => r.required(),
      readOnly: true,
    }),
    defineField({
      name: "detected_at",
      title: "検知日時",
      type: "datetime",
      validation: (r) => r.required(),
      readOnly: true,
    }),
    defineField({
      name: "import_run",
      title: "検知した実行回",
      type: "reference",
      to: [{ type: "productImportRun" }],
      validation: (r) => r.required(),
      readOnly: true,
    }),
    defineField({
      name: "status",
      title: "状態",
      type: "string",
      options: { list: STATUS_OPTIONS },
      initialValue: "pending",
      readOnly: true,
    }),
    defineField({
      name: "reviewed_at",
      title: "対応日時",
      type: "datetime",
      readOnly: true,
    }),
  ],
  preview: {
    select: {
      title: "product.name",
      subtitle: "status",
    },
    prepare({ title, subtitle }) {
      const statusLabel = STATUS_OPTIONS.find(
        (o) => o.value === subtitle
      )?.title;
      return {
        title: title ?? "（商品未設定）",
        subtitle: statusLabel,
      };
    },
  },
});
