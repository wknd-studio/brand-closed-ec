import Papa from "papaparse";

import type { UnifiedProductRecord } from "./unified-product-schema";

/**
 * csvCatalogドキュメントのcsv_column_mappingフィールドの実体（contracts/vendor-adapter-interface.md）。
 * このデータソースのCSV列名 → 統一データ形式フィールドの対応。マッピングしなかった列は単純に
 * 破棄される（例: 業者独自の商品ID・卸値・備考等）。
 */
export interface CsvColumnMapping {
  jan_code?: string;
  name: string;
  brand_name?: string; // 列が無いデータはundefined。その場合catalog.defaultBrandNameを使う（FR-027）
  retail_price: string;
  availability?: string;
  vendor_cost_rate?: string; // 「掛け率」等、業者提示の仕入れ支払い比率の列名（任意）
  case_quantity?: string; // 「入数」等の列名（任意）
}

export interface CsvAdapterCatalog {
  catalogId: string;
  /** CSVにbrand_name列が無いデータ向けの固定ブランド名（catalog.default_brand参照先の名前） */
  defaultBrandName?: string;
  columnMapping: CsvColumnMapping;
}

export interface CsvRowError {
  rowNumber: number;
  reason: string;
}

const OUT_OF_STOCK_TOKENS = new Set([
  "out_of_stock",
  "out of stock",
  "在庫切れ",
  "品切れ",
  "なし",
  "no",
  "false",
  "0",
  "×",
  "x",
]);

/**
 * CSVをパースし、データソースごとのcolumnMapping（データ、コードの分岐ではない）を使って
 * 統一データ形式（UnifiedProductRecord）へ変換する（FR-002）。
 * マッピングされなかった列は読み捨てる。行単位のエラーは他の行の変換に影響しない（FR-007）。
 * ブランドは行ごとのデータであり、1つのcatalogに複数ブランドの行が混ざっていてもよい
 * （CSVにブランド列があれば行ごとにそれを使い、無ければcatalogの既定ブランドで穴埋めする）。
 */
export function mapCsvToUnifiedRecords(
  csvText: string,
  catalog: CsvAdapterCatalog
): { records: UnifiedProductRecord[]; errors: CsvRowError[] } {
  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const errors: CsvRowError[] = parsed.errors.map((e) => ({
    rowNumber: (e.row ?? 0) + 2,
    reason: e.message,
  }));

  const records: UnifiedProductRecord[] = [];
  const mapping = catalog.columnMapping;

  parsed.data.forEach((row, index) => {
    const rowNumber = index + 2; // 1行目はヘッダー、データは2行目から

    const name = readColumn(row, mapping.name);
    const brandName =
      readColumn(row, mapping.brand_name) ?? catalog.defaultBrandName;
    const retailPrice = parseNumber(readColumn(row, mapping.retail_price));

    if (!name) {
      errors.push({ rowNumber, reason: "商品名が読み取れません" });
      return;
    }
    if (!brandName) {
      errors.push({
        rowNumber,
        reason:
          "ブランド名が読み取れません（CSVに列が無く、デフォルトブランドも未設定です）",
      });
      return;
    }
    if (retailPrice == null) {
      errors.push({ rowNumber, reason: "定価が数値として読み取れません" });
      return;
    }

    records.push({
      janCode: readColumn(row, mapping.jan_code),
      name,
      brandName,
      retailPrice,
      vendorCostRate:
        parseNumber(readColumn(row, mapping.vendor_cost_rate)) ?? undefined,
      caseQuantity:
        parseNumber(readColumn(row, mapping.case_quantity)) ?? undefined,
      availability: normalizeAvailability(
        readColumn(row, mapping.availability)
      ),
      catalogId: catalog.catalogId,
      origin: { kind: "csv", rowNumber },
    });
  });

  return { records, errors };
}

function readColumn(
  row: Record<string, string>,
  columnName: string | undefined
): string | undefined {
  if (!columnName) return undefined;
  const value = row[columnName]?.trim();
  return value ? value : undefined;
}

function parseNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const cleaned = raw.replace(/[^\d.-]/g, "");
  // "不明"等、数字を一切含まない文字列はNumber("")===0になってしまうため明示的に弾く
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return undefined;
  const numeric = Number(cleaned);
  return Number.isNaN(numeric) ? undefined : numeric;
}

function normalizeAvailability(
  raw: string | undefined
): "available" | "out_of_stock" {
  if (!raw) return "available";
  return OUT_OF_STOCK_TOKENS.has(raw.trim().toLowerCase())
    ? "out_of_stock"
    : "available";
}
