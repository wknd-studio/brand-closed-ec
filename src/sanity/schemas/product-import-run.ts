import { defineField, defineType } from "sanity";

export const productImportRun = defineType({
  name: "productImportRun",
  title: "商品インポート実行結果",
  type: "document",
  fields: [
    defineField({
      name: "catalog",
      title: "対象データソース",
      type: "reference",
      to: [{ type: "csvCatalog" }, { type: "scrapingCatalog" }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: "triggered_by",
      title: "実行契機",
      type: "string",
      options: {
        list: [
          { title: "定期実行", value: "scheduled" },
          { title: "オンデマンド実行", value: "on_demand" },
          { title: "手動CSVインポート", value: "manual_csv" },
        ],
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "started_at",
      title: "実行開始日時",
      type: "datetime",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "finished_at",
      title: "実行終了日時",
      type: "datetime",
    }),
    defineField({
      name: "outcome",
      title: "結果",
      type: "string",
      options: {
        list: [
          { title: "完了", value: "completed" },
          { title: "エラー率閾値超過で中止", value: "aborted_error_threshold" },
          { title: "異常終了", value: "failed" },
        ],
      },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "success_count",
      title: "成功件数",
      type: "number",
      validation: (r) => r.required().min(0),
    }),
    defineField({
      name: "failure_count",
      title: "失敗件数",
      type: "number",
      validation: (r) => r.required().min(0),
    }),
    defineField({
      name: "needs_review_count",
      title: "要確認件数",
      type: "number",
      validation: (r) => r.required().min(0),
    }),
    defineField({
      name: "error_details",
      title: "エラー詳細",
      type: "array",
      of: [
        {
          type: "object",
          fields: [
            defineField({ name: "target", title: "対象", type: "string" }),
            defineField({ name: "reason", title: "理由", type: "string" }),
          ],
        },
      ],
    }),
  ],
  preview: {
    select: {
      title: "catalog.label",
      subtitle: "started_at",
    },
    prepare({ title, subtitle }) {
      return {
        title: title ?? "（データソース未設定）",
        subtitle: subtitle
          ? new Date(subtitle).toLocaleString("ja-JP")
          : undefined,
      };
    },
  },
});
