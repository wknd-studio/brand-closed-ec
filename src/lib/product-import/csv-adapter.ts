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
  /**
   * 実際に項目名（ヘッダー）が並んでいる行番号（1始まり）。省略時は1。
   * 業者のCSVによっては、先頭に案内文や空行が入っていて1行目がヘッダーでない場合がある
   * （例: 「1万円以上で送料無料」等の案内文が1〜2行目、ヘッダーは4行目、というケース）。
   */
  headerRowNumber?: number;
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
 * ヘッダー行より前の案内文・空行、データ中の区切り用の空行は、エラーにせず読み飛ばす。
 */
export function mapCsvToUnifiedRecords(
  csvText: string,
  catalog: CsvAdapterCatalog
): { records: UnifiedProductRecord[]; errors: CsvRowError[] } {
  // header: trueは使わず配列のまま取得する。案内文等が1行目に来るCSVに対応するため、
  // ヘッダー行の位置を自由に指定できるようにする必要があるため
  const parsed = Papa.parse<string[]>(csvText, { skipEmptyLines: false });

  const errors: CsvRowError[] = parsed.errors.map((e) => ({
    rowNumber: (e.row ?? 0) + 1,
    reason: e.message,
  }));

  const headerRowIndex = Math.max((catalog.headerRowNumber ?? 1) - 1, 0);
  const headerRow = parsed.data[headerRowIndex] ?? [];
  const mapping = catalog.columnMapping;

  const records: UnifiedProductRecord[] = [];

  for (let i = headerRowIndex + 1; i < parsed.data.length; i++) {
    const rowNumber = i + 1; // 1始まりの実ファイル行番号
    const cells = parsed.data[i];
    if (isBlankRow(cells)) continue; // 区切り用の空行はエラーにせず読み飛ばす

    const row = toRowObject(headerRow, cells);

    const name = readColumn(row, mapping.name);
    const brandName =
      readColumn(row, mapping.brand_name) ?? catalog.defaultBrandName;
    const retailPrice = parseNumber(readColumn(row, mapping.retail_price));

    if (!name) {
      errors.push({ rowNumber, reason: "商品名が読み取れません" });
      continue;
    }
    if (!brandName) {
      errors.push({
        rowNumber,
        reason:
          "ブランド名が読み取れません（CSVに列が無く、デフォルトブランドも未設定です）",
      });
      continue;
    }
    if (retailPrice == null) {
      errors.push({ rowNumber, reason: "定価が数値として読み取れません" });
      continue;
    }

    records.push({
      janCode: readColumn(row, mapping.jan_code),
      name,
      brandName,
      retailPrice,
      vendorCostRate:
        parseVendorCostRate(readColumn(row, mapping.vendor_cost_rate)) ??
        undefined,
      caseQuantity:
        parseNumber(readColumn(row, mapping.case_quantity)) ?? undefined,
      availability: normalizeAvailability(
        readColumn(row, mapping.availability)
      ),
      catalogId: catalog.catalogId,
      origin: { kind: "csv", rowNumber },
    });
  }

  return { records, errors };
}

function isBlankRow(cells: string[]): boolean {
  return cells.every((cell) => !cell || cell.trim() === "");
}

function toRowObject(
  headerRow: string[],
  cells: string[]
): Record<string, string> {
  const row: Record<string, string> = {};
  headerRow.forEach((header, index) => {
    if (header) row[header] = cells[index] ?? "";
  });
  return row;
}

function readColumn(
  row: Record<string, string>,
  columnName: string | undefined
): string | undefined {
  if (!columnName) return undefined;
  const value = row[columnName]?.trim();
  return value ? value : undefined;
}

export function parseNumber(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const cleaned = raw.replace(/[^\d.-]/g, "");
  // "不明"等、数字を一切含まない文字列はNumber("")===0になってしまうため明示的に弾く
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return undefined;
  const numeric = Number(cleaned);
  return Number.isNaN(numeric) ? undefined : numeric;
}

/**
 * 仕入れ掛け率の値を解釈する。日本の卸取引でよく使われる「N掛（け）」表記
 * （例: 「6掛」＝定価の60%、「4.9掛」＝49%）は、Nが1桁の掛け率を表す慣習のため
 * ×10して%に変換する。それ以外（素の数値・「60%」等）は通常通り%として扱う
 * （実際の業者CSVで「N掛」表記が判明したため対応）。
 */
function parseVendorCostRate(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const kakeMatch = raw.trim().match(/^(\d+(?:\.\d+)?)\s*掛け?$/);
  if (kakeMatch) {
    return Number(kakeMatch[1]) * 10;
  }
  return parseNumber(raw);
}

export function normalizeAvailability(
  raw: string | undefined
): "available" | "out_of_stock" {
  if (!raw) return "available";
  return OUT_OF_STOCK_TOKENS.has(raw.trim().toLowerCase())
    ? "out_of_stock"
    : "available";
}
