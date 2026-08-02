---
description: "Task list template for feature implementation"
---

# Tasks: 業者商品データの統一インポート基盤

**Input**: Design documents from `/specs/004-product-data-import/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Story**: US1=CSV提供業者からの商品データ一括インポート, US2=サイト注文専用業者の商品データ自動収集（オンデマンド実行含む）, US3=定期実行による継続的な同期・要確認キュー

**Linear**: 本タスク一式はLinear連携スキルを通じて起票してから実装に着手する（Constitution「開発ワークフロー」準拠）。

## テストについて

CLAUDE.mdのテスト自動選択ルールに従い、CSV変換・重複判定・検証・エラー率閾値判定・スクレイピングアダプターの変換ロジックなど「純粋な計算・バリデーション関数」にはユニットテストを先に書く（テスト→失敗確認→実装の順）。Sanity Studioカスタムツールの見た目自体は「UIの見た目・レイアウト」に該当し自動テスト対象外とし、quickstart.mdの手動検証で担保する（plan.mdのTesting方針に準拠）。

---

## Phase 1: Setup

- [x] T001 [P] 依存関係を追加する（`papaparse`・`cheerio`。research.md #2, #4参照）: `package.json`
- [x] T002 [P] ディレクトリ雛形を作成する: `src/lib/product-import/`, `src/sanity/tools/product-import/`, `scripts/product-import/vendors/`, `tests/unit/product-import/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: JANコード・vendor・productImportRun等、3つのUser Storyすべてが依存する共有ロジックとSanityスキーマ

**⚠️ CRITICAL**: このフェーズが完了するまで、どのUser Storyの実装にも着手できない

- [x] T003 [P] `config.ts`を実装する（エラー率閾値`IMPORT_ERROR_THRESHOLD_RATIO = 0.3`、定期実行頻度の定数。Constitution原則V「事実の単一情報源化」対応）: `src/lib/product-import/config.ts`
- [x] T004 [P] 統一データ形式`UnifiedProductRecord`の型を実装する（contracts/unified-product-schema.md準拠）: `src/lib/product-import/unified-product-schema.ts`
- [x] T005 [P] `dedupe.ts`の失敗するユニットテストを書く（JANコード一致を優先、JANコードが無い場合は商品名+ブランドの完全一致でフォールバック、いずれも一致しない場合は新規商品と判定。FR-004/005）: `tests/unit/product-import/dedupe.test.ts`（依存: T004）
- [x] T006 [P] `validate-and-preview.ts`の失敗するユニットテストを書く（必須項目欠落・不正な価格・ブランド未解決の行をエラーとする、バッチ内JANコード重複を検知する、エラー行の割合が閾値を超えたら中止と判定する。FR-006, FR-020, Edge Cases）: `tests/unit/product-import/validate-and-preview.test.ts`（依存: T003, T004）
- [x] T007 `dedupe.ts`を実装しT005を通す: `src/lib/product-import/dedupe.ts`（依存: T005）
- [x] T008 `validate-and-preview.ts`を実装しT006を通す: `src/lib/product-import/validate-and-preview.ts`（依存: T006, T007）
- [x] T009 [P] `product`スキーマに`jan_code`（string, 任意）・`source_vendor`（reference→vendor, 任意）フィールドを追加する（FR-003, data-model.md）: `src/sanity/schemas/product.ts`
- [x] T010 [P] `vendor`スキーマを新規作成する（`name`, `data_source_type`, `is_contracted`, `csv_column_mapping`, `scrape_target_url`, `scrape_adapter_id`。data-model.md準拠）: `src/sanity/schemas/vendor.ts`
- [x] T011 [P] `productImportRun`スキーマを新規作成する（`vendor`, `triggered_by`, `started_at`, `finished_at`, `outcome`, `success_count`, `failure_count`, `needs_review_count`, `error_details`。FR-015, FR-018, FR-023）: `src/sanity/schemas/product-import-run.ts`
- [x] T012 新規スキーマ（`vendor`, `productImportRun`）を登録する: `src/sanity/schemas/index.ts`（依存: T009, T010, T011）
- [x] T013 `apply-import.ts`を実装する（検証済み`UnifiedProductRecord[]`とdedupe結果を受け取り、Sanityへ`product`の`createOrReplace`と`productImportRun`ドキュメントの作成を行う）: `src/lib/product-import/apply-import.ts`（依存: T007, T008, T012）

### Phase 2 補足（業者の具体例検証で判明した修正。FR-024〜027）

業者Cの実際のCSV列構成（商品ID・入数・掛け率・卸値等）を例に仕様を検証した結果、業者の仕入れ掛け率をそのまま会員向けランク価格に使うと原価割れのリスクがあると判明。ユーザーと協議し、仕入れ掛け率は運営者専用の参照情報として保持し、会員向け価格計算には使わない方針に修正した。

- [x] T013a `product`スキーマに`vendor_cost_rate`（運営者専用の仕入れ掛け率）・`case_quantity`（入数、任意）フィールドを追加する（FR-024, FR-026）: `src/sanity/schemas/product.ts`
- [x] T013b `validatePrices`に、`vendor_cost_rate`を下回るランク価格がある場合エラーとする下限チェックを追加する（FR-025）: `src/sanity/schemas/product.ts`, `tests/unit/sanity/product-price-validation.test.ts`
- [x] T013c `apply-import.ts`で会員向けランク価格を常にブランド/デフォルト掛け率設定のみから計算するよう修正し（業者の掛け率は使わない）、`validatePrices`を書き込み前に呼び出して下限違反を書き込まずエラーとして記録するようにする: `src/lib/product-import/apply-import.ts`, `tests/unit/product-import/apply-import.test.ts`
- [x] T013d `vendor`スキーマに`default_brand`（CSVにブランド列が無い業者向けの固定ブランド）、`csv_column_mapping`に`vendor_cost_rate`・`case_quantity`の列マッピング項目を追加する（FR-027）: `src/sanity/schemas/vendor.ts`
- [x] T013e `UnifiedProductRecord`から`rankPrices`を削除し、`vendorCostRate`・`caseQuantity`を追加する: `src/lib/product-import/unified-product-schema.ts`

**チェックポイント**: 共有ロジック・Sanityスキーマ基盤が完成。以降の3つのUser Storyへ並行着手できる

---

## Phase 3: User Story 1 - CSV提供業者からの商品データ一括インポート (Priority: P1) 🎯 MVP

**Goal**: 商品管理担当者がSanity Studio上のインポートツールからCSVをアップロードし、検証プレビューを確認して実行を確定すると、商品がSanity上に一括作成・更新される

**Independent Test**: quickstart.md「User Story 1」「User Story 1: エラー行・閾値超過」のシナリオ

- [x] T014 [P] [US1] `csv-adapter.ts`の失敗するユニットテストを書く（複数の業者別CSV列構成パターンを、`vendor.csv_column_mapping`を使って統一データ形式へ変換できることを検証。FR-002, contracts/vendor-adapter-interface.md）: `tests/unit/product-import/csv-adapter.test.ts`（依存: T004）
- [x] T015 [US1] `csv-adapter.ts`を実装しT014を通す: `src/lib/product-import/csv-adapter.ts`（依存: T014）
- [x] T016 [US1] 検証プレビュー計算をStudioツールから呼び出すフック`use-import-preview.ts`を実装する（`validate-and-preview.ts`のラップ）: `src/sanity/tools/product-import/use-import-preview.ts`（依存: T008）
- [x] T017 [US1] Sanity Studioカスタムツール本体を実装する（CSVアップロード→`csv-adapter`で変換→検証プレビュー表示→担当者の確定操作で`apply-import`を呼び出し書き込み。FR-016, FR-019）: `src/sanity/tools/product-import/product-import-tool.tsx`（依存: T015, T016, T013）
- [x] T018 [US1] カスタムツールをStudioに登録する（pluginsへの追加、商品管理配下へのナビゲーション項目追加）: `sanity.config.ts`, `src/sanity/structure.ts`（依存: T017）
- [ ] T019 [US1] quickstart.md「User Story 1」「User Story 1: エラー行・閾値超過」の手順を手動検証する（依存: T018）

### Phase 3 補足（手動検証・設計対話で判明した修正）

- [x] T018a `sanity.cli.ts`のvite設定にtsconfigの`@/* -> src/*`エイリアスを追加する（Sanity StudioはNext.jsとは別のVite設定のため、手動起動時に`@/lib/product-import/...`の解決エラーが発生した）: `sanity.cli.ts`
- [x] T018b CSVインポートツールに使い方ガイド（ブランド作成→データソース作成→アップロード→確認→確定の手順）と、データソースが1件も無い場合の案内を追加する: `src/sanity/tools/product-import/product-import-tool.tsx`
- [x] T018c `vendor.is_contracted`フラグを削除する（vendorドキュメントが存在すること自体が取引関係を意味するため冗長と判断。ユーザーとの協議）: `src/sanity/schemas/vendor.ts`, data-model.md, contracts/trigger-api.md
- [x] T018d 業者ドキュメントの入力しやすさを改善する（URL・CSV列名等にプレースホルダーを表示する`createPlaceholderTextInput`を追加）: `src/sanity/schemas/placeholder-text-input.tsx`, `src/sanity/schemas/vendor.ts`
- [x] T018e **`vendor`型を廃止し`csvCatalog`/`scrapingCatalog`の2型に再設計する**（ユーザーとの協議。詳細はdata-model.md「商品データソース」参照）:
  - ブランドは行（商品）ごとのデータであり「1業者/1データソース=1ブランド」を前提にできないため、`default_brand`は「データにブランド情報が無い行への穴埋め」としてのみ位置づける
  - CSVは運営者がStudio上でデータのみで完結できるが、スクレイピングは開発者がコード（`scrape_adapter_id`に対応する`scraper.ts`）を書かないと成立しないため、Studio上での操作可否（作成・削除の可否）を型として分離する
  - `csvCatalog`（運営者がStudio上で自由にCRUD）・`scrapingCatalog`（開発者がコードと一緒に用意。`sanity.config.ts`の`document.actions`/`newDocumentOptions`で新規作成・削除をUIレベルでロック）を新規作成: `src/sanity/schemas/csv-catalog.ts`, `src/sanity/schemas/scraping-catalog.ts`, `src/sanity/schemas/vendor.ts`（削除）
  - `product.source_vendor`→`source_catalog`、`productImportRun.vendor`→`catalog`にリネーム（両catalog型を参照）: `src/sanity/schemas/product.ts`, `src/sanity/schemas/product-import-run.ts`
  - コード内の`vendorId`/`CsvAdapterVendor`等を`catalogId`/`CsvAdapterCatalog`に統一: `src/lib/product-import/csv-adapter.ts`, `src/lib/product-import/apply-import.ts`, `src/lib/product-import/unified-product-schema.ts`, `src/sanity/tools/product-import/use-import-preview.ts`, `src/sanity/tools/product-import/product-import-tool.tsx`
  - `validate-and-preview.ts`に`preExistingErrors`が無くてもエラー率分母を正しく計算する既存修正は維持しつつ、テストのcatalogId化を実施: `tests/unit/product-import/*.test.ts`
- [x] T018f CSV列マッピングの入力をテキスト手打ちから表形式（サンプルCSVアップロード→実際の列名をプルダウンで選択）に変更する: `src/sanity/schemas/csv-column-mapping-input.tsx`, `src/sanity/schemas/csv-catalog.ts`
- [x] T018g 実際の業者CSV（先頭に案内文・複数行見出し・区切り空行を含むもの）で検証し、`csv-adapter.ts`を実データに対応させる。`header_row_number`（ヘッダー行の指定、csvCatalogに追加）、区切り空行のスキップ、「N掛」表記（N×10%）の仕入れ掛け率パースに対応。マッピング入力UIにヘッダー行選択機能を追加: `src/lib/product-import/csv-adapter.ts`, `src/sanity/schemas/csv-catalog.ts`, `src/sanity/schemas/csv-column-mapping-input.tsx`, `src/sanity/tools/product-import/product-import-tool.tsx`, `tests/unit/product-import/csv-adapter.test.ts`

**チェックポイント**: User Story 1（MVP）が独立して機能・検証可能

---

## Phase 4: User Story 2 - サイト注文専用業者の商品データ自動収集 (Priority: P2)

**Goal**: 契約済みでCSV提供のない業者について、担当者が業者単位で「今すぐ実行」すると、スクレイピング→統一データ形式への変換→検証プレビュー→確定という流れでSanityへ反映される

**Independent Test**: quickstart.md「User Story 2: スクレイピング（ローカル動作確認）」「User Story 2: オンデマンド実行（Studio経由）」のシナリオ

- [ ] T020 [P] [US2] `CatalogScraper`インターフェースを定義する（contracts/vendor-adapter-interface.md準拠）: `src/lib/product-import/catalog-scraper.ts`
- [ ] T021 [P] [US2] 固定HTMLフィクスチャに対する失敗するユニットテストを書く（cheerioベースのアダプター実装がHTMLを統一データ形式へ正しく変換できることを検証）: `tests/unit/product-import/vendors/fixture-vendor.test.ts`（依存: T004, T020）
- [ ] T022 [US2] フィクスチャ向けの参照実装アダプターを実装しT021を通す（今後の実業者アダプター実装のひな形とする）: `scripts/product-import/vendors/__fixture__/scraper.ts`（依存: T021）
- [ ] T023 [US2] `run-on-demand.ts`を実装する（Sanityから対象`scrapingCatalog`を取得→スクレイパー実行→`validate-and-preview`→`apply-import`→`productImportRun`（`triggered_by: "on_demand"`）記録。ページ構造想定外時は例外を投げ担当者に通知。FR-008, FR-010, FR-022）: `scripts/product-import/run-on-demand.ts`（依存: T022, T008, T013）
- [ ] T024 [US2] GitHub Actionsワークフローを新規作成する（`workflow_dispatch`で`catalogId`を受け取り`run-on-demand.ts`を実行。research.md #3参照）: `.github/workflows/product-data-sync.yml`（依存: T023）
- [ ] T025 [P] [US2] トリガーAPIの失敗するユニットテストを書く（不正トークン→401、対象が`scrapingCatalog`型でない→400、正常系→GitHub Actions呼び出しのモック検証。contracts/trigger-api.md）: `tests/unit/app/api/admin/product-import-trigger.test.ts`
- [ ] T026 [US2] トリガーAPIエンドポイントを実装しT025を通す（`X-Product-Import-Token`検証→`scrapingCatalog`ドキュメント確認→GitHub `workflow_dispatch`呼び出し。FR-021, contracts/trigger-api.md）: `src/app/api/admin/product-import/trigger/route.ts`（依存: T024, T025）
- [ ] T027 [US2] Studioの「今すぐ実行」ボタンを実装し、`scrapingCatalog`ドキュメント画面に組み込む: `src/sanity/tools/product-import/on-demand-trigger-button.tsx`（依存: T026）
- [ ] T028 [US2] quickstart.md「User Story 2: スクレイピング（ローカル動作確認）」「User Story 2: オンデマンド実行（Studio経由）」の手順を手動検証する（依存: T027）

**チェックポイント**: User Story 2が独立して機能・検証可能

---

## Phase 5: User Story 3 - 定期実行による商品情報の継続的な同期 (Priority: P3)

**Goal**: 収集・インポート処理が日次で無人実行され、情報源から消えた商品は自動でdiscontinuedにせず「要確認」状態として担当者の確認・承認を経て反映される

**Independent Test**: quickstart.md「User Story 3: 定期実行と要確認キュー」のシナリオ

- [ ] T029 [P] [US3] `productAvailabilityReview`スキーマを新規作成し登録する（`product`, `catalog`, `detected_at`, `import_run`, `status`, `reviewed_at`。FR-014, data-model.md）: `src/sanity/schemas/product-availability-review.ts`, `src/sanity/schemas/index.ts`
- [ ] T030 [P] [US3] 消失商品検知ロジックの失敗するユニットテストを書く（前回実行時の商品集合と今回の商品集合を比較し、今回存在しないものを検出する。FR-013）: `tests/unit/product-import/detect-disappeared-products.test.ts`
- [ ] T031 [US3] `detect-disappeared-products.ts`を実装しT030を通す: `src/lib/product-import/detect-disappeared-products.ts`（依存: T030）
- [ ] T032 [US3] `run-scheduled-sync.ts`を実装する（`scrapingCatalog`を全件処理、catalog単位のエラーはスキップして他catalogの処理を継続、エラー率閾値超過時はその回の実行をスキップし担当者に通知、`detect-disappeared-products`で消失商品を検知し`productAvailabilityReview`（`status: "pending"`）を作成。FR-009, FR-010, FR-013, FR-014, FR-020）: `scripts/product-import/run-scheduled-sync.ts`（依存: T022, T029, T031, T013）
- [ ] T033 [US3] GitHub Actionsワークフローに日次`schedule`（cron）トリガーを追加し`run-scheduled-sync.ts`を実行する（FR-012）: `.github/workflows/product-data-sync.yml`（依存: T032, T024）
- [ ] T034 [US3] `productAvailabilityReview`に対するSanity Studioドキュメントアクションを実装する（承認→対象`product.availability`を`discontinued`に更新し`status: "approved_discontinued"`に、却下→`status: "dismissed"`に。FR-014）: `src/sanity/tools/product-import/product-availability-review-actions.ts`（依存: T029）
- [ ] T035 [US3] 「要確認」一覧を商品管理配下に追加する（`status: "pending"`の`productAvailabilityReview`を表示。FR-018）: `src/sanity/structure.ts`（依存: T029, T034）
- [ ] T036 [US3] quickstart.md「User Story 3: 定期実行と要確認キュー」の手順を手動検証する（依存: T033, T034, T035）

**チェックポイント**: 全User Storyが独立して機能する

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T037 [P] `pnpm typecheck` / `pnpm lint` / `pnpm test`（`tests/unit/product-import/`一式）が全て通過することを確認する
- [ ] T038 [P] `docs/cicd.md`に新規ワークフロー（`product-data-sync.yml`）と新規テスト対象（`tests/unit/product-import/`）を追記する
- [ ] T039 quickstart.mdの全シナリオ（User Story 1〜3）を通しで再実行し、横断的なリグレッションがないことを確認する

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なしで開始できる
- **Foundational (Phase 2)**: Setup完了後。全User Storyをブロックする
- **User Story 1（Phase 3）**: Foundational完了後に着手できる。他User Storyへの依存なし
- **User Story 2（Phase 4）**: Foundational完了後に着手できる。他User Storyへの依存なし（`csv-adapter.ts`は使わない）
- **User Story 3（Phase 5）**: Foundational完了後に着手できるが、`run-scheduled-sync.ts`（T032）と`.github/workflows/product-data-sync.yml`（T033）はUser Story 2で作られるスクレイパー基盤（T022）・ワークフローファイル（T024）を土台にするため、実務上はUser Story 2の完了後に着手するのが自然
- **Polish (Phase 6)**: 全User Story完了後

### Parallel Opportunities

- Phase 1のT001・T002は並行実行可能
- Phase 2のT003・T004・T005・T006・T009・T010・T011はそれぞれ異なるファイルで依存関係もないため並行実行可能
- Foundational完了後、User Story 1（Phase 3）とUser Story 2（Phase 4）は異なるファイルセットのため並行着手可能（User Story 3はUser Story 2のスクレイパー基盤に依存するため実務上は後続）

---

## Parallel Example: Foundational

```bash
Task: "dedupe.tsの失敗するユニットテストを書く: tests/unit/product-import/dedupe.test.ts"
Task: "validate-and-preview.tsの失敗するユニットテストを書く: tests/unit/product-import/validate-and-preview.test.ts"
Task: "vendorスキーマを新規作成する: src/sanity/schemas/vendor.ts"
Task: "productImportRunスキーマを新規作成する: src/sanity/schemas/product-import-run.ts"
```

---

## Suggested PR Split（CLAUDE.mdのPRサイズ規律に対応）

1. PR1: Phase 1 + T003〜T008（依存関係追加、共有ロジック: config・統一データ形式・dedupe・validate-and-preview）
2. PR2: T009〜T013（Sanityスキーマ拡張・新設: product/vendor/productImportRun、apply-import実装）
3. PR3: Phase 3 全体（T014〜T019） — User Story 1（CSVインポート、MVP）
4. PR4: T020〜T024（VendorScraperインターフェース・フィクスチャアダプター・run-on-demand・GitHub Actionsワークフロー新設）
5. PR5: T025〜T028（オンデマンド実行トリガーAPI・Studioの「今すぐ実行」ボタン）
6. PR6: Phase 5 全体（T029〜T036） — User Story 3（定期実行・要確認キュー）
7. PR7: Phase 6 全体（T037〜T039） — 仕上げ

PR2・PR6はファイル数が5を超える可能性があるため、実装時に差分規模を見てさらに分割してよい（分割しない場合はPR説明にその理由を明記する。CLAUDE.md準拠）。

## Implementation Strategy

### MVP First

Phase 1 → Phase 2（Foundational） → Phase 3（User Story 1）で一旦止めて検証する。CSV提供業者からの一括インポートだけでも、BRAND-135の当初の目的（手動登録の運用負荷低減）に対して独立した価値がある。

### Incremental Delivery

Foundational完了後、User Story 1とUser Story 2は並行して進められる。User Story 3はUser Story 2のスクレイパー基盤を前提とするため、User Story 2の完了後に着手する。
