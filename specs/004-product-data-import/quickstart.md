# Quickstart: 業者商品データの統一インポート基盤

実装後、以下の手順で各User Storyが仕様通り動作することを確認する。

## 前提

```bash
supabase start        # 本featureでは使わないが、既存の開発フロー通り起動しておく
pnpm dev               # Next.jsアプリ（トリガーAPIの動作確認用）
```

Sanity Studioはローカルのstagingデータセットに対して実行する（`sanity.config.ts`の`staging`構成）。

## User Story 1: CSVインポート

1. Sanity Studioの「商品管理 → 商品データソース（CSV）」で`csvCatalog`ドキュメントを1件作成し、列マッピングを設定する
2. サンプルCSV（`src/lib/product-import/__fixtures__/catalog-a-sample.csv`、その列構成を模したもの、50行）を用意する
3. Sanity Studioの「商品CSVインポート」ツールを開き、作成したデータソースを選択してサンプルCSVをアップロードする
4. **期待結果**: 書き込み前に「成功見込み: 50件、エラー見込み: 0件」の検証プレビューが表示される
5. 「実行を確定する」を押す
6. **期待結果**: Sanity上に50件の`product`ドキュメントが新規作成され、`jan_code`・`source_catalog`が正しく設定されている
7. 同じCSVをもう一度アップロードして実行する
8. **期待結果**: 既存の50件が更新され、重複した商品としては作成されない（`ProductImportRun`の`success_count`は50、Sanity上の`product`件数は変わらない）

## User Story 1: エラー行・閾値超過

1. 必須項目（`name`）が欠落した行を数行含むCSVをアップロードする
2. **期待結果**: プレビューに「エラー見込み: N件」と表示され、実行確定後`ProductImportRun.error_details`に対象行と理由が記録される。正常な行は問題なく作成される
3. 列がずれたCSV（ほぼ全行がエラーになるもの）をアップロードする
4. **期待結果**: プレビューの時点でエラー率が閾値（30%）を超えている旨の警告が表示され、「実行を確定する」を押しても書き込みが一切行われない（Sanity上のドキュメント数が変化しない）

## User Story 2: スクレイピング（ローカル動作確認）

```bash
pnpm tsx scripts/product-import/run-on-demand.ts --catalog=scraping-catalog-b --dry-run
```

1. **期待結果**: `scraping-catalog-b`に対応するスクレイピングアダプターが実行され、統一データ形式のレコードが標準出力に表示される（`--dry-run`のためSanityへの書き込みはしない）
2. `--dry-run`を外して再実行する
3. **期待結果**: Sanity上に対象データソースの商品が作成され、`ProductImportRun`（`triggered_by: "on_demand"`）が記録される

## User Story 2: オンデマンド実行（Studio経由）

1. Sanity Studioの「商品管理 → 商品データソース（スクレイピング）」一覧から対象の`scrapingCatalog`を開き、「今すぐ実行」ボタンを押す
2. **期待結果**: `/api/admin/product-import/trigger`が`202`を返し、GitHub Actionsの`product-data-sync.yml`が`workflow_dispatch`で起動する（GitHub上のActionsタブで確認）
3. 実行完了後、Sanity Studio上の実行結果一覧に新しい`ProductImportRun`（`triggered_by: "on_demand"`）が表示される

## User Story 3: 定期実行と要確認キュー

1. 対象データソースのスクレイピング対象データから、商品を1件テスト用に取り除いた状態を用意する
2. 定期実行スクリプトを2回連続で実行する（1回目: 全件あり、2回目: 1件除いた状態）

   ```bash
   pnpm tsx scripts/product-import/run-scheduled-sync.ts --catalog=scraping-catalog-b
   ```

3. **期待結果**: 2回目の実行後、除いた商品に対応する`ProductAvailabilityReview`（`status: "pending"`）がSanity上に作成される。対象`product`の`availability`はまだ`available`のまま変わらない
4. Sanity Studio上で当該レビューを「取り扱い終了として承認」する
5. **期待結果**: 対象`product`の`availability`が`discontinued`に変わり、`ProductAvailabilityReview.status`が`approved_discontinued`になる

## 自動テスト

```bash
pnpm test -- tests/unit/product-import
```

- `dedupe.test.ts`: JANコード優先＋商品名/ブランド完全一致フォールバックの各パターン
- `validate-and-preview.test.ts`: 必須項目欠落・不正値・エラー率閾値超過の判定
- `csv-adapter.test.ts`: データソース別列マッピングの変換
- `vendors/<scrape_adapter_id>/scraper.test.ts`: 固定HTMLフィクスチャからの統一データ形式への変換
