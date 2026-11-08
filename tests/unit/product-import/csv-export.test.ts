import { describe, it, expect } from "vitest";
import { unifiedRecordsToCsv } from "@/lib/product-import/csv-export";
import { mapCsvToUnifiedRecords } from "@/lib/product-import/csv-adapter";
import type { CsvColumnMapping } from "@/lib/product-import/csv-adapter";
import type { UnifiedProductRecord } from "@/lib/product-import/unified-product-schema";

function record(
  overrides: Partial<UnifiedProductRecord> = {}
): UnifiedProductRecord {
  return {
    name: "プレミアムトート",
    brandName: "ACME",
    retailPrice: 45000,
    availability: "available",
    catalogId: "scraping-catalog-b",
    origin: { kind: "scraping", sourceUrl: "https://example.com/catalog" },
    ...overrides,
  };
}

describe("unifiedRecordsToCsv", () => {
  it("全項目がある場合、日本語ヘッダーのCSVへ変換する", () => {
    const csv = unifiedRecordsToCsv([
      record({
        janCode: "4901234567894",
        vendorCostRate: 60,
        caseQuantity: 12,
      }),
    ]);

    expect(csv).toContain(
      "商品名,ブランド,JANコード,定価,在庫状況,仕入れ掛け率,入数"
    );
    expect(csv).toContain(
      "プレミアムトート,ACME,4901234567894,45000,あり,60,12"
    );
  });

  it("任意項目が無い場合は空欄にする", () => {
    const csv = unifiedRecordsToCsv([record()]);

    expect(csv).toContain("プレミアムトート,ACME,,45000,あり,,");
  });

  it("在庫切れはCSV上「なし」と表記する", () => {
    const csv = unifiedRecordsToCsv([record({ availability: "out_of_stock" })]);

    expect(csv).toContain(",なし,");
  });

  it("既存のCSVインポートロジック（mapCsvToUnifiedRecords）で読み戻せる（ラウンドトリップ）", () => {
    const original = [
      record({
        janCode: "4901234567894",
        vendorCostRate: 60,
        caseQuantity: 12,
      }),
      record({
        name: "クラシックデニム",
        brandName: "BETA",
        retailPrice: 12000,
        availability: "out_of_stock",
        catalogId: "scraping-catalog-b",
        origin: { kind: "scraping", sourceUrl: "https://example.com/catalog" },
      }),
    ];
    const csv = unifiedRecordsToCsv(original);

    const mapping: CsvColumnMapping = {
      jan_code: "JANコード",
      name: "商品名",
      brand_name: "ブランド",
      retail_price: "定価",
      availability: "在庫状況",
      vendor_cost_rate: "仕入れ掛け率",
      case_quantity: "入数",
    };
    const { records, errors } = mapCsvToUnifiedRecords(csv, {
      catalogId: "csv-catalog-from-export",
      columnMapping: mapping,
    });

    expect(errors).toHaveLength(0);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      janCode: "4901234567894",
      name: "プレミアムトート",
      brandName: "ACME",
      retailPrice: 45000,
      vendorCostRate: 60,
      caseQuantity: 12,
      availability: "available",
    });
    expect(records[1]).toMatchObject({
      name: "クラシックデニム",
      brandName: "BETA",
      retailPrice: 12000,
      availability: "out_of_stock",
    });
  });
});
