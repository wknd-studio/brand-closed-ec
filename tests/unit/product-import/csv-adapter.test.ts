import { describe, it, expect } from "vitest";
import { mapCsvToUnifiedRecords } from "@/lib/product-import/csv-adapter";
import type { CsvAdapterVendor } from "@/lib/product-import/csv-adapter";

describe("mapCsvToUnifiedRecords", () => {
  it("業者Aの列構成（日本語ヘッダー、JANあり、在庫は「あり/なし」）を統一データ形式へ変換する", () => {
    const csv =
      "商品名,ブランド,JAN,定価,在庫\nプレミアムトート,ACME,4901234567894,45000,あり";
    const vendor: CsvAdapterVendor = {
      vendorId: "vendor-a",
      columnMapping: {
        jan_code: "JAN",
        name: "商品名",
        brand_name: "ブランド",
        retail_price: "定価",
        availability: "在庫",
      },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, vendor);

    expect(errors).toHaveLength(0);
    expect(records).toEqual([
      {
        janCode: "4901234567894",
        name: "プレミアムトート",
        brandName: "ACME",
        retailPrice: 45000,
        vendorCostRate: undefined,
        caseQuantity: undefined,
        availability: "available",
        vendorId: "vendor-a",
        origin: { kind: "csv", rowNumber: 2 },
      },
    ]);
  });

  it("業者Bの列構成（英語ヘッダー、JAN無し）を統一データ形式へ変換する", () => {
    const csv =
      "SKU,ItemName,Brand,MSRP,Stock\n,クラシックデニム,BETA,12000,in_stock";
    const vendor: CsvAdapterVendor = {
      vendorId: "vendor-b",
      columnMapping: {
        name: "ItemName",
        brand_name: "Brand",
        retail_price: "MSRP",
        availability: "Stock",
      },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, vendor);

    expect(errors).toHaveLength(0);
    expect(records[0].janCode).toBeUndefined();
    expect(records[0].name).toBe("クラシックデニム");
    expect(records[0].brandName).toBe("BETA");
    expect(records[0].retailPrice).toBe(12000);
    expect(records[0].availability).toBe("available");
  });

  it("業者Cの列構成（ブランド列なし・入数/掛け率あり・マッピングしていない列は無視）を変換する", () => {
    const csv =
      "商品ID,商品名,上代(税別),JAN,入数,掲示(掛け率),卸値(税別),備考\n" +
      "C-1029,ヴィンテージシャツ,18000,4912345678901,6,55,9900,数量限定";
    const vendor: CsvAdapterVendor = {
      vendorId: "vendor-c",
      defaultBrandName: "業者C専属ブランド",
      columnMapping: {
        jan_code: "JAN",
        name: "商品名",
        retail_price: "上代(税別)",
        vendor_cost_rate: "掲示(掛け率)",
        case_quantity: "入数",
        // brand_name列は無い業者なので指定しない
        // 卸値(税別)・備考・商品IDはマッピングしないため破棄される
      },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, vendor);

    expect(errors).toHaveLength(0);
    expect(records).toEqual([
      {
        janCode: "4912345678901",
        name: "ヴィンテージシャツ",
        brandName: "業者C専属ブランド",
        retailPrice: 18000,
        vendorCostRate: 55,
        caseQuantity: 6,
        availability: "available",
        vendorId: "vendor-c",
        origin: { kind: "csv", rowNumber: 2 },
      },
    ]);
  });

  it("ブランド列が無くdefaultBrandNameも未設定の場合、エラーとして報告する", () => {
    const csv = "商品名,定価\nテスト商品,1000";
    const vendor: CsvAdapterVendor = {
      vendorId: "vendor-d",
      columnMapping: { name: "商品名", retail_price: "定価" },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, vendor);

    expect(records).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].rowNumber).toBe(2);
    expect(errors[0].reason).toContain("ブランド");
  });

  it("定価が数値として読み取れない行はエラーとして報告する", () => {
    const csv = "商品名,ブランド,定価\nテスト商品,ブランドA,不明";
    const vendor: CsvAdapterVendor = {
      vendorId: "vendor-a",
      columnMapping: {
        name: "商品名",
        brand_name: "ブランド",
        retail_price: "定価",
      },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, vendor);

    expect(records).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].reason).toContain("定価");
  });

  it("複数行のうち一部だけエラーでも、正常な行は変換される", () => {
    const csv =
      "商品名,ブランド,定価\n" +
      "商品A,ブランドA,1000\n" +
      ",ブランドA,2000\n" +
      "商品C,ブランドA,3000";
    const vendor: CsvAdapterVendor = {
      vendorId: "vendor-a",
      columnMapping: {
        name: "商品名",
        brand_name: "ブランド",
        retail_price: "定価",
      },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, vendor);

    expect(records).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].rowNumber).toBe(3);
  });
});
