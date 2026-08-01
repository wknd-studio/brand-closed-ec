# Data Model: 業者商品データの統一インポート基盤

## 既存エンティティの拡張

### Product（`src/sanity/schemas/product.ts`）

既存フィールド（`name`, `brand`, `retail_price`, `price_rates`, `prices`, `min_rank`, `availability`等）に加え、以下を追加する。

| フィールド         | 型                                           | 必須 | 説明                                                                                                                                                                           |
| ------------------ | -------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `jan_code`         | string                                       | 任意 | JANコード。重複判定（FR-004）の優先キー。業者によっては提供されないため必須にしない                                                                                            |
| `source_catalog`   | reference(`csvCatalog` \| `scrapingCatalog`) | 任意 | この商品データの取得元データソース。手動でSanity Studio上から直接作成された商品は空でもよい                                                                                    |
| `vendor_cost_rate` | number（0〜100）                             | 任意 | 業者提示の仕入れ掛け率（定価に対する仕入れ支払い比率）。運営者専用の参照情報で、会員向けランク価格の自動計算には使わない（FR-024）。`prices`の下限チェックにのみ使う（FR-025） |
| `case_quantity`    | number                                       | 任意 | 入数（1梱包あたりの数量）。価格計算には関与しない、単なる商品情報（FR-026）                                                                                                    |

`availability`の既存の値（`available` / `out_of_stock` / `discontinued`）はそのまま使う。情報源から消えた商品を即座に`discontinued`にはしない（FR-014）ため、値自体の追加は不要で、代わりに`ProductAvailabilityReview`（後述）で保留状態を表現する。

**`prices`のバリデーション拡張**: 既存の`validatePrices`（`src/sanity/schemas/product.ts`）に、`vendor_cost_rate`が設定されている場合の下限チェックを追加する。`retail_price × vendor_cost_rate / 100`（仕入れ値）を下回るランクが1つでもあれば保存をエラーとしてブロックする（FR-025）。このチェックはSanity StudioでのUI編集だけでなく、`apply-import.ts`がAPI経由で書き込む際にも同じ関数（`validatePrices`）を呼び出して適用する（Sanityのフィールドバリデーションはスキーマ経由のAPI書き込みには効かないため）。

## 新規エンティティ

### 商品データソース（`vendor`型を廃止し2つのドキュメントタイプに再設計）

**設計変更の経緯**: 当初は`vendor`（業者）という単一ドキュメントに、業務的な情報（取引先）と技術的な取り込み設定（CSV列マッピング・スクレイピング設定）を同居させていたが、以下の理由で見直した（ユーザーとの協議）。

- ブランドは行（商品）ごとのデータであり、「1業者=1ブランド」「1データソース=1ブランド」という前提を置けない。`default_brand`はあくまで「データにブランド情報が無い行への穴埋め」であり、業者やデータソース単位の決め打ちではない
- CSVはデータ（列マッピング）だけで運営者がStudio上で完結できるのに対し、スクレイピングは開発者が専用コード（`scrape_adapter_id`に対応する`scraper.ts`）を実装しないと成立しない。この運用上の違いにより、Studio上での操作可否（作成・削除できるかどうか）を型として分けた方が実現しやすい
- 唯一正しく言える単位は「1つのデータソース（1本のCSV、または1つのスクレイピング対象）」であり、「業者」という上位概念は技術的な設定には不要と判断した（業務記録が必要になった場合は、`label`に業者名を含める運用や、将来的な軽量な参照フィールドの追加で対応する）

このため、`vendor`型を廃止し、`csvCatalog`（運営者がStudio上で自由に作成・編集・削除）と`scrapingCatalog`（開発者がスクレイピングコードと一緒に用意し、Studio上では作成・削除をロックする）の2つのドキュメントタイプに再設計した。

### CsvCatalog（`src/sanity/schemas/csv-catalog.ts`）

CSV提供業者からの商品データソース1本の取り込み設定。運営者がSanity Studio上で自由に作成・編集・削除する。

| フィールド           | 型                 | 必須 | 説明                                                                                                                                                                                                                                                   |
| -------------------- | ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `label`              | string             | 必須 | 表示名（業者名や用途など、他のCSVデータソースと区別できる名前）                                                                                                                                                                                        |
| `default_brand`      | reference(`brand`) | 任意 | このCSVにブランド列（またはブランドが分かる情報）が無い場合の既定ブランド。行ごとの列値があればそちらを優先                                                                                                                                            |
| `header_row_number`  | number             | 任意 | 項目名（ヘッダー）が実際に並んでいる行番号（1始まり、既定値1）。先頭に案内文・空行がある業者CSVに対応するため（実データ検証で判明）                                                                                                                    |
| `csv_column_mapping` | object             | 任意 | このCSVの列名 → 統一データ形式フィールドのマッピング定義（JAN・商品名・ブランド名・定価・在庫状況・仕入れ掛け率・入数）。サンプルCSVをアップロードすると先頭行のプレビューからヘッダー行を選択でき、実際の列名からプルダウンで選べるカスタム入力を持つ |

**業者CSVの実データ検証で判明した追加対応**: 実際の業者CSV（先頭に送料案内等の自由テキスト、複数行にまたがる見出しセル、区切り用の空行を含むもの）を検証した結果、以下を`csv-adapter.ts`側で吸収するようにした。

- ヘッダー行が1行目でない場合に対応するため`header_row_number`を追加（上記）
- データ中の区切り用の空行（全セルが空）はエラーにせず読み飛ばす
- 仕入れ掛け率が「6掛」「4.9掛」のような日本の卸取引慣習表記（N掛け＝N×10%）の場合、数値をそのまま抽出せず×10して%に変換する
- 同名のヘッダー列が複数ある場合、後に出現した列の値で上書きされる（既知の制約。今のところ実際に必要なマッピングでは同名列を使わないため実害なし）

### ScrapingCatalog（`src/sanity/schemas/scraping-catalog.ts`）

スクレイピング対象の商品データソース1本の設定。開発者がスクレイピングコード（`scripts/product-import/vendors/<scrape_adapter_id>/scraper.ts`）を実装する際に、コード側（シードスクリプト等）で一緒に用意する。Sanity Studio上では`document.actions`/`document.newDocumentOptions`（`sanity.config.ts`）により、新規作成・削除ボタンを非表示にしている（UIレベルの誤操作防止であり、データセットへの書き込み権限を持つ場合はAPI経由で操作できてしまう点に注意）。運営者は実行結果の確認やデフォルトブランドの調整程度の関わりに留まる。

| フィールド          | 型                 | 必須 | 説明                                                             |
| ------------------- | ------------------ | ---- | ---------------------------------------------------------------- |
| `label`             | string             | 必須 | 表示名                                                           |
| `default_brand`     | reference(`brand`) | 任意 | 収集したデータにブランドが分かる情報が無い場合の既定ブランド     |
| `scrape_target_url` | url                | 必須 | スクレイピング対象のページURL                                    |
| `scrape_adapter_id` | string             | 必須 | `scripts/product-import/vendors/<id>/`に対応するアダプター識別子 |

**取引契約の扱いについて**: 当初は`is_contracted`フラグでFR-009（自動収集対象を取引契約のある業者に限定する）を保証する設計だったが、`vendor`（現`scrapingCatalog`）ドキュメントが存在すること自体が取引関係の存在を意味するため、専用フラグは冗長と判断し削除した（ユーザーとの協議）。FR-009は運用プロセス（取引のある業者についてのみ`scrapingCatalog`ドキュメントを作成する）で担保する。

### ProductImportRun（`src/sanity/schemas/product-import-run.ts`）

spec.md Key Entity「インポート実行結果」。CSVインポート・スクレイピング収集いずれの経路の実行結果も同じ形で記録する。

| フィールド           | 型                                                                   | 必須 | 説明                                                               |
| -------------------- | -------------------------------------------------------------------- | ---- | ------------------------------------------------------------------ |
| `catalog`            | reference(`csvCatalog` \| `scrapingCatalog`)                         | 必須 | 対象データソース                                                   |
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
| `catalog`     | reference(`csvCatalog` \| `scrapingCatalog`)                        | 必須 | どのデータソースの収集で検知されたか                                   |
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
