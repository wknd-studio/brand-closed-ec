import { describe, it, expect } from "vitest";
import { parseCatalogHtml } from "../../../../scripts/product-import/vendors/__fixture__/scraper";

const CATALOG_ID = "__fixture__";
const SOURCE_URL = "https://example.com/catalog";

const VALID_HTML = `
<html>
  <body>
    <div class="product-list">
      <div class="product" data-jan="4901234567894">
        <span class="name">プレミアムトート</span>
        <span class="brand">ACME</span>
        <span class="price">45,000円</span>
        <span class="stock">在庫あり</span>
      </div>
      <div class="product">
        <span class="name">クラシックデニム</span>
        <span class="brand">BETA</span>
        <span class="price">12,000円</span>
        <span class="stock">在庫切れ</span>
      </div>
    </div>
  </body>
</html>
`;

describe("parseCatalogHtml", () => {
  it("商品一覧HTMLを統一データ形式へ変換する", () => {
    const records = parseCatalogHtml(VALID_HTML, CATALOG_ID, SOURCE_URL);

    expect(records).toEqual([
      {
        janCode: "4901234567894",
        name: "プレミアムトート",
        brandName: "ACME",
        retailPrice: 45000,
        vendorCostRate: undefined,
        caseQuantity: undefined,
        availability: "available",
        catalogId: CATALOG_ID,
        origin: { kind: "scraping", sourceUrl: SOURCE_URL },
      },
      {
        janCode: undefined,
        name: "クラシックデニム",
        brandName: "BETA",
        retailPrice: 12000,
        vendorCostRate: undefined,
        caseQuantity: undefined,
        availability: "out_of_stock",
        catalogId: CATALOG_ID,
        origin: { kind: "scraping", sourceUrl: SOURCE_URL },
      },
    ]);
  });

  it("商品一覧のコンテナ自体が見つからない場合、ページ構造の想定外の変化として例外を投げる", () => {
    const html = "<html><body><p>ページが見つかりません</p></body></html>";

    expect(() => parseCatalogHtml(html, CATALOG_ID, SOURCE_URL)).toThrow();
  });

  it("商品項目に商品名が無い場合、ページ構造の想定外の変化として例外を投げる", () => {
    const html = `
      <div class="product-list">
        <div class="product">
          <span class="brand">ACME</span>
          <span class="price">45,000円</span>
        </div>
      </div>
    `;

    expect(() => parseCatalogHtml(html, CATALOG_ID, SOURCE_URL)).toThrow();
  });

  it("商品項目に価格が無い場合、ページ構造の想定外の変化として例外を投げる", () => {
    const html = `
      <div class="product-list">
        <div class="product">
          <span class="name">プレミアムトート</span>
          <span class="brand">ACME</span>
        </div>
      </div>
    `;

    expect(() => parseCatalogHtml(html, CATALOG_ID, SOURCE_URL)).toThrow();
  });
});
