import type { UnifiedProductRecord } from "./unified-product-schema";

/**
 * scrapingCatalogごとのスクレイピング処理を表すインターフェース
 * （contracts/vendor-adapter-interface.md）。
 * `scripts/product-import/vendors/<scrape_adapter_id>/scraper.ts`が、これを実装した
 * オブジェクトをデフォルトエクスポートする。
 * ページ構造の想定外の変化を検知した場合はscrape()内で例外を投げる。呼び出し元
 * （run-scheduled-sync.ts / run-on-demand.ts）がcatalog単位でキャッチしてスキップ・通知する。
 */
export interface CatalogScraper {
  catalogId: string;
  scrape(): Promise<UnifiedProductRecord[]>;
}
