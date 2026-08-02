import { defineField, defineType } from "sanity";

const SOURCE_OPTIONS = [
  { title: "手元のCSVファイルを保存", value: "manual_upload" },
  { title: "スクレイピングによる自動生成", value: "scheduled_scrape" },
];

const STATUS_OPTIONS = [
  { title: "未取り込み", value: "pending" },
  { title: "取り込み済み", value: "imported" },
];

/**
 * 商品データのCSVファイルを、実際にインポートする前にSanity上へ保存しておく置き場所。
 * スクレイピング経由の自動生成CSVも、業者から届いた手元のCSVも、いったんここに置いてから
 * 既存のCSVインポート画面（検証プレビュー→人間による確定）で取り込む。書き込み前の
 * 人間による確認を、取得経路によらず常に担保するための設計（ユーザーとの協議）。
 * statusは取り込みの確定操作からのみ更新され、Studio上での手動編集は認めない
 * （productImportRunと同じ理由: 監査ログとしての整合性を保つため）
 */
export const productCsvUpload = defineType({
  name: "productCsvUpload",
  title: "取り込み待ちCSV",
  type: "document",
  fields: [
    defineField({
      name: "catalog",
      title: "対象カタログ",
      type: "reference",
      to: [{ type: "csvCatalog" }],
      validation: (r) => r.required(),
    }),
    defineField({
      name: "file",
      title: "CSVファイル",
      type: "file",
      options: { accept: ".csv,text/csv" },
      validation: (r) => r.required(),
    }),
    defineField({
      name: "source",
      title: "取得経路",
      type: "string",
      options: { list: SOURCE_OPTIONS },
      initialValue: "manual_upload",
      validation: (r) => r.required(),
    }),
    defineField({
      name: "uploaded_at",
      title: "保存日時",
      type: "datetime",
      initialValue: () => new Date().toISOString(),
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
  ],
  preview: {
    select: {
      title: "catalog.label",
      subtitle: "status",
      status: "status",
    },
    prepare({ title, status }) {
      const statusLabel = STATUS_OPTIONS.find((o) => o.value === status)?.title;
      return {
        title: title ?? "（データソース未設定）",
        subtitle: statusLabel,
      };
    },
  },
});
