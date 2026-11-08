import type { UnifiedProductRecord } from "./unified-product-schema";

/**
 * スクレイピング対象の商品CSVカタログ（csvCatalog）ごとの収集処理を表すインターフェース
 * （contracts/vendor-adapter-interface.md）。
 * `scripts/product-import/vendors/<adapter-id>/scraper.ts`が、これを実装した
 * オブジェクトをデフォルトエクスポートする。対象URL・catalogIdはSanityではなく
 * このアダプターのコード側で管理する（scrapingCatalogは廃止し商品CSVカタログへ統合）。
 * catalogIdは対応する商品CSVカタログ（csvCatalog）ドキュメントの`_id`と一致させる。
 * ページ構造の想定外の変化を検知した場合はscrape()内で例外を投げる。呼び出し元
 * （run-scheduled-sync.ts / export-csv.ts）がcatalog単位でキャッチしてスキップ・通知する。
 */
export interface CatalogScraper {
  catalogId: string;
  scrape(): Promise<UnifiedProductRecord[]>;
}
