# Data Model: 業者商品データの統一インポート基盤

## 既存エンティティの拡張

### Product（`src/sanity/schemas/product.ts`）

既存フィールド（`name`, `brand`, `retail_price`, `price_rates`, `prices`, `min_rank`, `availability`等）に加え、以下を追加する。

| フィールド         | 型                  | 必須 | 説明                                                                                                                                                                           |
| ------------------ | ------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `jan_code`         | string              | 任意 | JANコード。重複判定（FR-004）の優先キー。業者によっては提供されないため必須にしない                                                                                            |
| `source_vendor`    | reference(`vendor`) | 任意 | この商品データの取得元業者。手動でSanity Studio上から直接作成された商品は空でもよい                                                                                            |
| `vendor_cost_rate` | number（0〜100）    | 任意 | 業者提示の仕入れ掛け率（定価に対する仕入れ支払い比率）。運営者専用の参照情報で、会員向けランク価格の自動計算には使わない（FR-024）。`prices`の下限チェックにのみ使う（FR-025） |
| `case_quantity`    | number              | 任意 | 入数（1梱包あたりの数量）。価格計算には関与しない、単なる商品情報（FR-026）                                                                                                    |

`availability`の既存の値（`available` / `out_of_stock` / `discontinued`）はそのまま使う。情報源から消えた商品を即座に`discontinued`にはしない（FR-014）ため、値自体の追加は不要で、代わりに`ProductAvailabilityReview`（後述）で保留状態を表現する。

**`prices`のバリデーション拡張**: 既存の`validatePrices`（`src/sanity/schemas/product.ts`）に、`vendor_cost_rate`が設定されている場合の下限チェックを追加する。`retail_price × vendor_cost_rate / 100`（仕入れ値）を下回るランクが1つでもあれば保存をエラーとしてブロックする（FR-025）。このチェックはSanity StudioでのUI編集だけでなく、`apply-import.ts`がAPI経由で書き込む際にも同じ関数（`validatePrices`）を呼び出して適用する（Sanityのフィールドバリデーションはスキーマ経由のAPI書き込みには効かないため）。

## 新規エンティティ

### Vendor（`src/sanity/schemas/vendor.ts`）

商品データソースとなる業者（spec.md Key Entity「商品データソース（業者）」に対応）。

| フィールド           | 型                                            | 必須 | 説明                                                                                                                    |
| -------------------- | --------------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| `name`               | string                                        | 必須 | 業者名                                                                                                                  |
| `data_source_type`   | string（`"csv"` \| `"scraping"`）             | 必須 | CSV提供業者か、スクレイピング対象業者かの区分（FR-001 / FR-008の分岐）                                                  |
| `is_contracted`      | boolean                                       | 必須 | 取引契約の有無。`false`の業者は自動収集の対象にしない（FR-009のガード）                                                 |
| `default_brand`      | reference(`brand`)                            | 任意 | CSVにブランド列が無い業者向けの固定ブランド。CSV側にブランド列があればそちらを優先（FR-027）                            |
| `csv_column_mapping` | object（任意, `data_source_type=csv`時）      | 任意 | 業者のCSV列名 → 統一データ形式フィールドのマッピング定義（JAN・商品名・ブランド名・定価・在庫状況・仕入れ掛け率・入数） |
| `scrape_target_url`  | url（任意, `data_source_type=scraping`時）    | 任意 | スクレイピング対象のトップページ等                                                                                      |
| `scrape_adapter_id`  | string（任意, `data_source_type=scraping`時） | 任意 | `scripts/product-import/vendors/<vendor-id>/`に対応するアダプター識別子                                                 |

### ProductImportRun（`src/sanity/schemas/product-import-run.ts`）

spec.md Key Entity「インポート実行結果」。CSVインポート・スクレイピング収集いずれの経路の実行結果も同じ形で記録する。

| フィールド           | 型                                                                   | 必須 | 説明                                                               |
| -------------------- | -------------------------------------------------------------------- | ---- | ------------------------------------------------------------------ |
| `vendor`             | reference(`vendor`)                                                  | 必須 | 対象業者                                                           |
| `triggered_by`       | string（`"scheduled"` \| `"on_demand"` \| `"manual_csv"`）           | 必須 | 実行契機（FR-018）                                                 |
| `started_at`         | datetime                                                             | 必須 | 実行開始日時                                                       |
| `finished_at`        | datetime                                                             | 任意 | 実行終了日時（中止・失敗の場合も記録）                             |
| `outcome`            | string（`"completed"` \| `"aborted_error_threshold"` \| `"failed"`） | 必須 | 完了したか、エラー率閾値超過で中止したか（FR-020）、異常終了したか |
| `success_count`      | number                                                               | 必須 | 成功件数                                                           |
| `failure_count`      | number                                                               | 必須 | 失敗件数                                                           |
| `needs_review_count` | number                                                               | 必須 | 要確認件数（情報源から消えた商品の件数、FR-013）                   |
| `error_details`      | array of object（`{ target: string, reason: string }`）              | 任意 | 行・商品ごとのエラー詳細（FR-023）                                 |

検証プレビュー自体（実行前の見込み件数）はこのドキュメントには含めない。使い捨てのため永続化しない（Assumptions参照）。

### ProductAvailabilityReview（`src/sanity/schemas/product-availability-review.ts`）

spec.mdの「要確認」キュー（FR-014）。情報源から消えたことを検知した商品を、担当者が確認・承認するまで保持する。

| フィールド    | 型                                                                  | 必須 | 説明                                                                   |
| ------------- | ------------------------------------------------------------------- | ---- | ---------------------------------------------------------------------- |
| `product`     | reference(`product`)                                                | 必須 | 対象商品                                                               |
| `vendor`      | reference(`vendor`)                                                 | 必須 | どの業者の収集で検知されたか                                           |
| `detected_at` | datetime                                                            | 必須 | 情報源に存在しないことを検知した日時                                   |
| `import_run`  | reference(`productImportRun`)                                       | 必須 | 検知した実行回への参照（監査用）                                       |
| `status`      | string（`"pending"` \| `"approved_discontinued"` \| `"dismissed"`） | 必須 | 未対応／担当者が取り扱い終了として承認／実際は販売継続中だったため却下 |
| `reviewed_at` | datetime                                                            | 任意 | 担当者が対応した日時                                                   |

`status`が`approved_discontinued`になったタイミングで、Studio側のアクション（カスタムドキュメントアクション）が対象`product`の`availability`を`discontinued`へ更新する。

## Key Entity: UnifiedProductRecord（統一データ形式、Sanityドキュメントではない）

CSV由来・スクレイピング由来のいずれのデータも、Sanityへ書き込む前にこの形へ変換される。詳細なフィールド定義は[contracts/unified-product-schema.md](./contracts/unified-product-schema.md)を参照。Sanityのドキュメントではなく、`src/lib/product-import/`内のTypeScript型として定義され、インポート処理中のみ存在する一時的なデータである（FR-017: 主要データストアへの永続化はしない）。

## 状態遷移

```text
ProductImportRun.outcome:
  (実行開始) → completed | aborted_error_threshold | failed

ProductAvailabilityReview.status:
  pending → approved_discontinued   （担当者が承認 → product.availability = discontinued）
  pending → dismissed               （担当者が「実際は販売継続中」と判断・却下）
```
