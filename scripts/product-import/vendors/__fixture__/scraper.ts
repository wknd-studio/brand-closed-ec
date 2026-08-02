import * as cheerio from "cheerio";

import {
  normalizeAvailability,
  parseNumber,
} from "@/lib/product-import/csv-adapter";
import type { CatalogScraper } from "@/lib/product-import/catalog-scraper";
import type { UnifiedProductRecord } from "@/lib/product-import/unified-product-schema";

/**
 * 今後の実業者アダプター実装のひな形となる参照実装（T022）。
 * 業者サイトの商品一覧ページが、商品ごとに.productブロックを持つ
 * .product-listコンテナを持つ想定でHTMLを解析する。
 */

const CATALOG_ID = "__fixture__";
// 実業者アダプターでは、対応するscrapingCatalogドキュメントのscrape_target_urlと同じ値にする
const SOURCE_URL = "https://example.com/catalog";

/**
 * HTML→統一データ形式の変換ロジック本体（テスト容易性のためscrape()から分離）。
 * コンテナや必須フィールド（商品名・価格）が見つからない場合は、ページ構造が
 * 想定外に変化したとみなし例外を投げる（呼び出し元がcatalog単位でキャッチする）。
 */
export function parseCatalogHtml(
  html: string,
  catalogId: string,
  sourceUrl: string
): UnifiedProductRecord[] {
  const $ = cheerio.load(html);
  const items = $(".product-list .product");

  if (items.length === 0) {
    throw new Error(
      "商品一覧のコンテナ（.product-list）が見つかりません。ページ構造が変わった可能性があります"
    );
  }

  return items
    .map((_, el): UnifiedProductRecord => {
      const item = $(el);
      const name = item.find(".name").text().trim();
      const brandName = item.find(".brand").text().trim();
      const retailPrice = parseNumber(item.find(".price").text());

      if (!name) {
        throw new Error(
          "商品名（.name）が取得できませんでした。ページ構造が変わった可能性があります"
        );
      }
      if (!brandName) {
        throw new Error(
          `商品「${name}」のブランド名（.brand）が取得できませんでした。ページ構造が変わった可能性があります`
        );
      }
      if (retailPrice == null) {
        throw new Error(
          `商品「${name}」の価格（.price）が取得できませんでした。ページ構造が変わった可能性があります`
        );
      }

      return {
        janCode: item.attr("data-jan") || undefined,
        name,
        brandName,
        retailPrice,
        availability: normalizeAvailability(item.find(".stock").text()),
        catalogId,
        origin: { kind: "scraping", sourceUrl },
      };
    })
    .get();
}

const fixtureScraper: CatalogScraper = {
  catalogId: CATALOG_ID,
  async scrape() {
    const response = await fetch(SOURCE_URL);
    if (!response.ok) {
      throw new Error(
        `${SOURCE_URL}の取得に失敗しました（status: ${response.status}）`
      );
    }
    const html = await response.text();
    return parseCatalogHtml(html, CATALOG_ID, SOURCE_URL);
  },
};

export default fixtureScraper;
