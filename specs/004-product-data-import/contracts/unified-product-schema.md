# Contract: 統一商品データ形式（UnifiedProductRecord）

業者から提供されたCSV、またはスクレイピングで収集したデータは、Sanityへの書き込み（`apply-import.ts`）に渡る前に、必ずこの形式に変換されていなければならない。CSVアダプター（`csv-adapter.ts`）とスクレイピングアダプター（`scripts/product-import/vendors/<vendor-id>/scraper.ts`）は、どちらもこの形式の配列を返す責務を持つ。

## 型定義（TypeScript）

```typescript
interface UnifiedProductRecord {
  /** 突合キー。存在する場合は最優先で使う（FR-004） */
  janCode?: string;

  /** 完全一致フォールバック突合に使う（FR-005） */
  name: string;
  brandName: string;

  retailPrice: number;

  /** 未指定のランクはproduct側のデフォルト掛け率設定に委ねる */
  rankPrices?: Partial<Record<RankKey, number>>;

  availability: "available" | "out_of_stock";
  // "discontinued" は要確認フロー（FR-014）を経て反映するため、
  // アダプターの出力段階では選択できない

  minRank?: RankKey;

  /** どの業者由来かの記録。ProductImportRun・product.source_vendorに使う */
  vendorId: string;

  /** エラー報告時に「何行目/どの商品か」を示すための出所情報。Sanityへは書き込まない */
  origin:
    | { kind: "csv"; rowNumber: number }
    | { kind: "scraping"; sourceUrl: string };
}
```

## 検証ルール（`validate-and-preview.ts`が適用する）

- `name`・`brandName`・`retailPrice`は必須。欠落または`retailPrice <= 0`の場合はエラー行として扱う（FR-006、Edge Cases）
- `brandName`は既存の`brand`ドキュメントの名前と一致しなければならない。一致しない場合はエラー行として扱う（Edge Cases: ブランド参照が解決できない）
- 同一バッチ内で`janCode`が重複する場合、後勝ちとしエラーとしても報告する（Edge Cases）
- 上記検証を経て「エラー行数 / 全行数」がしきい値（`config.ts`の`IMPORT_ERROR_THRESHOLD_RATIO`、初期値0.3）を超える場合、バッチ全体を`aborted_error_threshold`として扱い、有効な行を含め一切書き込みを行わない（FR-020）

## 使われ方

- `csv-adapter.ts`: 業者のCSV（任意の列構成）→ `UnifiedProductRecord[]`
- `scripts/product-import/vendors/<vendor-id>/scraper.ts`: 業者サイトのHTML → `UnifiedProductRecord[]`
- `validate-and-preview.ts`: `UnifiedProductRecord[]` → 検証結果（成功見込み/エラー見込み、エラー詳細）
- `apply-import.ts`: 検証済み`UnifiedProductRecord[]` → Sanity `product`ドキュメントへの`createOrReplace`（JANコード優先、フォールバック完全一致でのdedupe後）
