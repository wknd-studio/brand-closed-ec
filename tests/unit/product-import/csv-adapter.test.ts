import { describe, it, expect } from "vitest";
import { mapCsvToUnifiedRecords } from "@/lib/product-import/csv-adapter";
import type { CsvAdapterCatalog } from "@/lib/product-import/csv-adapter";

describe("mapCsvToUnifiedRecords", () => {
  it("業者Aの列構成（日本語ヘッダー、JANあり、在庫は「あり/なし」）を統一データ形式へ変換する", () => {
    const csv =
      "商品名,ブランド,JAN,定価,在庫\nプレミアムトート,ACME,4901234567894,45000,あり";
    const catalog: CsvAdapterCatalog = {
      catalogId: "catalog-a",
      columnMapping: {
        jan_code: "JAN",
        name: "商品名",
        brand_name: "ブランド",
        retail_price: "定価",
        availability: "在庫",
      },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, catalog);

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
        catalogId: "catalog-a",
        origin: { kind: "csv", rowNumber: 2 },
      },
    ]);
  });

  it("業者Bの列構成（英語ヘッダー、JAN無し）を統一データ形式へ変換する", () => {
    const csv =
      "SKU,ItemName,Brand,MSRP,Stock\n,クラシックデニム,BETA,12000,in_stock";
    const catalog: CsvAdapterCatalog = {
      catalogId: "catalog-b",
      columnMapping: {
        name: "ItemName",
        brand_name: "Brand",
        retail_price: "MSRP",
        availability: "Stock",
      },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, catalog);

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
    const catalog: CsvAdapterCatalog = {
      catalogId: "catalog-c",
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

    const { records, errors } = mapCsvToUnifiedRecords(csv, catalog);

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
        catalogId: "catalog-c",
        origin: { kind: "csv", rowNumber: 2 },
      },
    ]);
  });

  it("ブランド列が無くdefaultBrandNameも未設定の場合、エラーとして報告する", () => {
    const csv = "商品名,定価\nテスト商品,1000";
    const catalog: CsvAdapterCatalog = {
      catalogId: "catalog-d",
      columnMapping: { name: "商品名", retail_price: "定価" },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, catalog);

    expect(records).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].rowNumber).toBe(2);
    expect(errors[0].reason).toContain("ブランド");
  });

  it("定価が数値として読み取れない行はエラーとして報告する", () => {
    const csv = "商品名,ブランド,定価\nテスト商品,ブランドA,不明";
    const catalog: CsvAdapterCatalog = {
      catalogId: "catalog-a",
      columnMapping: {
        name: "商品名",
        brand_name: "ブランド",
        retail_price: "定価",
      },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, catalog);

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
    const catalog: CsvAdapterCatalog = {
      catalogId: "catalog-a",
      columnMapping: {
        name: "商品名",
        brand_name: "ブランド",
        retail_price: "定価",
      },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, catalog);

    expect(records).toHaveLength(2);
    expect(errors).toHaveLength(1);
    expect(errors[0].rowNumber).toBe(3);
  });

  it("先頭に案内文・空行があるCSVでも、headerRowNumberで実際のヘッダー行を指定できる", () => {
    // 実際の業者CSV（KINUJO様式）を模したもの: 1行目が案内文（セル内改行を含むが、
    // ダブルクォートで囲まれているため論理的には1行＝Excel上の1行として扱われる）、
    // 2行目が空行、3行目が本当のヘッダー、4行目が空行、5行目以降がデータ
    const csv =
      '"1万円以上で送料無料。\n1点～から注文可能です。",,,\n' +
      ",,,\n" +
      "商品ID,商品名,JAN,上代\n" +
      ",,,\n" +
      "KH301,KINUJO Hair Dryer White,4589946770766,32000\n";
    const catalog: CsvAdapterCatalog = {
      catalogId: "catalog-kinujo",
      headerRowNumber: 3,
      defaultBrandName: "KINUJO",
      columnMapping: { jan_code: "JAN", name: "商品名", retail_price: "上代" },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, catalog);

    expect(errors).toHaveLength(0);
    expect(records).toEqual([
      {
        janCode: "4589946770766",
        name: "KINUJO Hair Dryer White",
        brandName: "KINUJO",
        retailPrice: 32000,
        vendorCostRate: undefined,
        caseQuantity: undefined,
        availability: "available",
        catalogId: "catalog-kinujo",
        origin: { kind: "csv", rowNumber: 5 },
      },
    ]);
  });

  it("headerRowNumber省略時は従来通り1行目をヘッダーとして扱う", () => {
    const csv = "商品名,ブランド,定価\n商品A,ブランドA,1000";
    const catalog: CsvAdapterCatalog = {
      catalogId: "catalog-a",
      columnMapping: {
        name: "商品名",
        brand_name: "ブランド",
        retail_price: "定価",
      },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, catalog);

    expect(errors).toHaveLength(0);
    expect(records[0].name).toBe("商品A");
    expect(records[0].origin).toEqual({ kind: "csv", rowNumber: 2 });
  });

  it("仕入れ掛け率が「N掛」表記の場合、N×10%として読み取る（実際の業者CSVで判明）", () => {
    const csv =
      "商品名,ブランド,上代,提示\n" +
      "商品A,ブランドA,32000,6掛\n" +
      "商品B,ブランドA,42000,4.9掛\n" +
      "商品C,ブランドA,25000,10掛";
    const catalog: CsvAdapterCatalog = {
      catalogId: "catalog-kinujo",
      columnMapping: {
        name: "商品名",
        brand_name: "ブランド",
        retail_price: "上代",
        vendor_cost_rate: "提示",
      },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, catalog);

    expect(errors).toHaveLength(0);
    expect(records[0].vendorCostRate).toBe(60);
    expect(records[1].vendorCostRate).toBe(49);
    expect(records[2].vendorCostRate).toBe(100);
  });

  it("仕入れ掛け率が素の数値（%表記）の場合は従来通り読み取る", () => {
    const csv = "商品名,ブランド,上代,掛け率\n商品A,ブランドA,10000,60";
    const catalog: CsvAdapterCatalog = {
      catalogId: "catalog-a",
      columnMapping: {
        name: "商品名",
        brand_name: "ブランド",
        retail_price: "上代",
        vendor_cost_rate: "掛け率",
      },
    };

    const { records, errors } = mapCsvToUnifiedRecords(csv, catalog);

    expect(errors).toHaveLength(0);
    expect(records[0].vendorCostRate).toBe(60);
  });
});
