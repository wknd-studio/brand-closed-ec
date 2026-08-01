# Contract: データソース・アダプター・インターフェース

データソースごとの差異（CSV列構成・スクレイピング方法）を共通ロジックから隔離するためのインターフェース。

## CSVアダプター

```typescript
interface CsvColumnMapping {
  /** csvCatalogドキュメントのcsv_column_mappingフィールドの実体 */
  janCode?: string; // CSV上の列名。未提供のデータはundefined
  name: string;
  brandName?: string; // 列が無いデータはundefined。その場合catalog.default_brandを使う（FR-027）
  retailPrice: string;
  availability?: string;
  vendorCostRate?: string; // 「掛け率」等、業者提示の仕入れ支払い比率の列名（任意）
  caseQuantity?: string; // 「入数」等の列名（任意）
}

function mapCsvRowToUnifiedRecord(
  row: Record<string, string>,
  mapping: CsvColumnMapping,
  catalog: { id: string; defaultBrandName?: string },
  rowNumber: number
): UnifiedProductRecord | CsvRowError;
```

データソースごとのCSV列構成の違いは、コードの分岐ではなく`csvCatalog`ドキュメントに保存された`csv_column_mapping`という**データ**で表現する。新しいCSVが増えても、コード変更なしにSanity Studio上で`csvCatalog`ドキュメントを追加するだけで対応できることを目指す（列の意味が同じで名前だけ違う典型的なケースを想定。特殊な変換ロジックが必要なケースが出てきた場合のみ、コードでの拡張を検討する）。

`mapping.brandName`が設定されていない場合、`row`からブランド名を読み取らず、`catalog.defaultBrandName`（`csvCatalog.default_brand`参照先のブランド名）をそのまま使う。CSVに列があれば行ごとにそちらを優先する（ブランドは行＝商品ごとのデータであり、1つのcatalogに複数ブランドの行が混ざっていてもよい）。マッピングされなかった列（例: 業者独自の商品ID・入数以外の備考等）は単純に読み捨てる。仕入れ値（`卸値`等）のような、掛け率から導出できる列もマッピング対象にしない（FR-024の趣旨: 仕入れ関連情報は掛け率一本で保持する）。

## スクレイピングアダプター

```typescript
interface CatalogScraper {
  catalogId: string;
  /** UnifiedProductRecordを返す。取得に失敗した場合は例外を投げる（run-scheduled-sync.ts側でcatalog単位のスキップとして処理する） */
  scrape(): Promise<UnifiedProductRecord[]>;
}
```

- `scripts/product-import/vendors/<scrape_adapter_id>/scraper.ts`は、この`CatalogScraper`を実装したオブジェクトをデフォルトエクスポートする
- このスクリプトの実装と合わせて、対応する`scrapingCatalog`ドキュメント（`scrape_adapter_id`にこのディレクトリ名を設定したもの）を開発者がコード側（シードスクリプト等）で用意する。運営者がSanity Studio上でこのドキュメントを新規作成することは想定しない（`sanity.config.ts`の`document.actions`/`newDocumentOptions`でUIレベルの作成・削除をロックしている）
- ページ構造の想定外の変化（FR-010）は、スクレイピング処理内で検知した時点で例外を投げることとし、呼び出し元（`run-scheduled-sync.ts` / `run-on-demand.ts`）がcatalog単位でキャッチしてスキップ・通知する。他のcatalogの処理は継続する（Edge Cases）
- HTML取得・パースの実装手段（`fetch` + `cheerio`か`playwright`か）はアダプター内部の実装詳細であり、`CatalogScraper`インターフェースの外からは意識しない
