import Papa from "papaparse";

import type { UnifiedProductRecord } from "./unified-product-schema";

/**
 * UnifiedProductRecord[]をCSVへ変換する（csv-adapter.tsの逆方向）。
 * スクレイピング結果を技術者がローカルでCSV化し、既存のCSVインポート画面（User Story 1）
 * から取り込むためのフォーマット（User Story 2の設計変更。旧run-on-demand.tsを廃止）。
 * ここで使う列名は、対応する`csvCatalog`ドキュメントの「CSV列マッピング」に
 * 一致させておく（一度設定すれば毎回そのまま使い回せる）。
 */
export const CSV_EXPORT_HEADER = [
  "商品名",
  "ブランド",
  "JANコード",
  "定価",
  "在庫状況",
  "仕入れ掛け率",
  "入数",
] as const;

export function unifiedRecordsToCsv(records: UnifiedProductRecord[]): string {
  return Papa.unparse({
    fields: [...CSV_EXPORT_HEADER],
    data: records.map(recordToRow),
  });
}

function recordToRow(record: UnifiedProductRecord): string[] {
  return [
    record.name,
    record.brandName,
    record.janCode ?? "",
    String(record.retailPrice),
    record.availability === "available" ? "あり" : "なし",
    record.vendorCostRate != null ? String(record.vendorCostRate) : "",
    record.caseQuantity != null ? String(record.caseQuantity) : "",
  ];
}
