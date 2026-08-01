# Implementation Plan: 業者商品データの統一インポート基盤

**Branch**: `feature/product-data-import` | **Date**: 2026-08-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-product-data-import/spec.md`

## Summary

商品管理担当者がSanity Studio上のカスタムツールからCSVをアップロードし、検証プレビュー→確認を経て商品データを一括作成・更新できるインポート機能（User Story 1）を中核に、機械可読なデータ提供がない業者向けにスクレイピングで統一データ形式のデータを生成し同じインポート処理へ流すパイプライン（User Story 2）、およびそれを日次で無人実行しつつ担当者が業者単位でオンデマンド実行もできる定期同期の仕組み（User Story 3）を実装する。CSVインポートはSanity Studioの認証済みクライアントを使い完全にブラウザ内で完結させ、スクレイピングと定期実行はGitHub Actions上のNode CLIスクリプトとして実装し、オンデマンド実行はStudioから既存の管理者API層（`src/app/api/admin/`）を経由してGitHub Actionsをディスパッチする。重複判定・エラー率閾値判定・統一データ形式への変換ロジックは、Sanityクライアントをモックした純粋なユニットテストで担保する。

## Technical Context

**Language/Version**: TypeScript 5（strict）、Node.js 22（既存CI・スクリプトと同じバージョン）

**Primary Dependencies**:

- 既存: `@sanity/client`（`scripts/seed-products.ts`と同じ書き込みパターン）、`sanity` / `@sanity/ui`（Studioカスタムツール）
- 新規追加: `papaparse`（CSVパース。ブラウザ・Node両方で動作し、既存の`scripts/`資産と将来のStudioツールの両方から共有ロジックとして使えるため選定。代替案の`csv-parse`はNode向けストリームAPIが中心でブラウザ実行に不向きなため不採用）
- 新規追加: `cheerio`（静的HTMLのスクレイピング用パーサー。軽量でCIのUbuntu runner上で高速に動く）。JavaScript描画に依存する業者サイトが判明した場合のみ、既存devDependencyの`@playwright/test`が提供する`playwright`ランタイムをそのアダプターに限定して使う（業者ごとのアダプター実装時に個別判断。全業者共通では強制しない）

**Storage**: Sanity（`product`ドキュメントへの`jan_code`・`source_vendor`フィールド追加、新規ドキュメントタイプ`vendor`・`productImportRun`・`productAvailabilityReview`の追加）。Supabaseへの変更なし（spec.md Assumptions通り）

**Testing**: Vitest（ユニット）。CSVパース→統一データ形式への変換、JANコード優先＋フォールバック突合、エラー率閾値判定、業者別アダプターのHTML→統一データ形式変換は「純粋な計算・バリデーション関数」としてユニットテスト対象とする（CLAUDE.mdのテスト自動選択ルール準拠）。既存の`tests/unit/sanity/`・`tests/unit/infrastructure/`と同様、`@sanity/client`は`vi.mock`でモックし実Sanityデータセットへは接続しない。Sanity StudioカスタムツールのUI自体（プレビュー画面の見た目）はCLAUDE.mdの基準で「UIの見た目・レイアウト」に該当し自動テスト不要とし、quickstart.mdの手動検証で担保する

**Target Platform**:

1. Sanity Studio上のカスタムツール（ブラウザ、`sanity deploy`でホスト） — CSVインポート（User Story 1）とオンデマンド実行トリガー・実行結果閲覧（User Story 2/3）
2. GitHub Actions scheduled workflow上で動くNode CLIスクリプト（Ubuntu runner） — スクレイピング・統一データ形式への変換・Sanityへの書き込みの定期実行（User Story 3）。Cloudflare Cron Triggersではなくこちらを選定した理由は、既存の`@sanity/client`を使うNode製スクリプト資産（`scripts/seed-products.ts`等）が既にGitHub Actions/ローカルCLI前提で書かれており、Cloudflare Workersランタイムでは`cheerio`等のNode依存ライブラリの動作保証が薄いため
3. 既存Next.jsアプリの`/api/admin`配下に追加する薄いトリガーエンドポイント（Cloudflare Pages Functions経由） — オンデマンド実行時にGitHub Actionsの`workflow_dispatch`をサーバーサイドから呼び出すためのプロキシ

**Project Type**: 既存monorepo（Next.js + Sanity Studio + scripts/）への機能追加。新規サービスの追加ではない（Option 1: Single project）

**Performance Goals**: SC-001準拠。数百行規模のCSV検証・書き込みが5分以内に完了する

**Constraints**:

- FR-017: 変換前の生データ（CSV原本・スクレイピング中間データ）を主要データストアへ永続化しない
- FR-019/020/022: 書き込み前の検証プレビュー、エラー率閾値（初期値30%）超過時の全体中止
- Sanity StudioはSanity独自の認証・権限モデルで動作し、Clerk（Next.jsアプリの会員認証）とは別システムである。オンデマンド実行のトリガーAPIは、Studio利用者個人をClerkで認証するのではなく、Studio専用のスコープ限定トークン（特定の1エンドポイントを叩く権限のみ）で保護する（詳細はresearch.md・contracts/trigger-api.md）

**Scale/Scope**: 1回あたり数百件規模（spec.md Assumptionsより）。業者数は初期は数社〜十数社を想定

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原則                            | 確認内容                                                                                                                                                                                                                                                                     | 判定    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| I. CLAUDE.mdを正とする          | テスト自動選択ルールに従いロジック層はユニットテスト、UIの見た目は手動検証とする。PRサイズ規律（200行/5ファイル目安）に従い、`/speckit-tasks`ではJANコード追加・vendor系スキーマ追加・CSVインポートツール・スクレイピング基盤・オンデマンドトリガーAPIを独立したPRに分割する | ✅ PASS |
| II. 受け入れ条件の明記          | spec.mdの各User Storyで「運営者が確認できること」「システムが保証すること」の2区分に整理済み                                                                                                                                                                                 | ✅ PASS |
| III. 曖昧さの解消を計画より先に | JANコード無し商品の突合方式・定期実行頻度・要確認商品の扱い・検証プレビュー/閾値中止・スクレイピングUX・データ保持方針は、いずれもユーザーとの対話で解消済み。`[NEEDS CLARIFICATION]`は残っていない                                                                          | ✅ PASS |
| IV. 実装記述と仕様意図の区別    | 本featureは新規機能であり、既存の実装を記述したドキュメントとの矛盾は発生しない                                                                                                                                                                                              | ✅ PASS |
| V. 事実の単一情報源化           | エラー率閾値（初期値30%）・定期実行頻度（日次）は`scripts/product-import/config.ts`（新規）に単一の定義箇所を置き、spec.md・plan.md・Studio UI表示はいずれもそこを参照する（値を複数箇所に書き写さない）                                                                     | ✅ PASS |

## Project Structure

### Documentation (this feature)

```text
specs/004-product-data-import/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── unified-product-schema.md
│   ├── vendor-adapter-interface.md
│   └── trigger-api.md
└── tasks.md                # /speckit-tasksで生成（本コマンドでは作成しない）
```

### Source Code（変更・追加対象の実ファイル）

```text
src/sanity/schemas/
├── product.ts                        # 変更: jan_code・source_vendor フィールド追加
├── vendor.ts                         # 新規: 業者（CSV提供／スクレイピング対象）
├── product-import-run.ts             # 新規: インポート・収集の実行結果ログ
├── product-availability-review.ts    # 新規: 情報源から消えた商品の要確認キュー
└── index.ts                          # 変更: 上記スキーマの登録

src/sanity/tools/product-import/
├── product-import-tool.tsx           # 新規: Sanity Studioカスタムツール本体（アップロード→プレビュー→確定）
├── use-import-preview.ts             # 新規: 検証プレビュー計算（共有ロジック呼び出し）
└── on-demand-trigger-button.tsx      # 新規: 業者ごとの「今すぐ実行」ボタン（trigger APIを呼ぶ）

src/lib/product-import/               # 新規: CSV・スクレイピング・Studioツール・GH Actionsスクリプトの共有ロジック
├── unified-product-schema.ts         # 統一データ形式の型定義
├── csv-adapter.ts                    # 業者別CSV列構成 → 統一データ形式
├── dedupe.ts                         # JANコード優先＋商品名/ブランド完全一致フォールバック
├── validate-and-preview.ts           # 検証・エラー率閾値判定・プレビュー計算（実行時と共有）
├── apply-import.ts                   # 統一データ形式 → Sanity createOrReplace
└── config.ts                         # エラー率閾値・実行頻度等の単一定義（Constitution原則V対応）

scripts/product-import/
├── vendors/
│   └── <vendor-id>/scraper.ts        # 新規: 業者ごとのスクレイピングアダプター（cheerio、必要な業者のみplaywright）
├── run-scheduled-sync.ts             # 新規: 日次定期実行のエントリーポイント（GitHub Actionsから呼ばれる）
└── run-on-demand.ts                  # 新規: オンデマンド実行のエントリーポイント（workflow_dispatchのinputで対象業者を受け取る）

.github/workflows/
└── product-data-sync.yml             # 新規: 日次スケジュール実行 + workflow_dispatch（オンデマンド実行の受け口）

src/app/api/admin/product-import/trigger/
└── route.ts                          # 新規: Studioからのオンデマンド実行要求を受け、GitHub Actions workflow_dispatchを呼ぶプロキシ

tests/unit/product-import/
├── dedupe.test.ts
├── validate-and-preview.test.ts
├── csv-adapter.test.ts
└── vendors/<vendor-id>/scraper.test.ts   # 固定HTMLフィクスチャに対するユニットテスト
```

**Structure Decision**: CSV変換・重複判定・検証・Sanity書き込みのロジックは`src/lib/product-import/`に一箇所に集約し、Sanity Studioのカスタムツール（ブラウザ実行）とGitHub Actions上のスクレイピングスクリプト（Node実行）の両方から同じ関数を呼び出す。これによりFR-019・FR-022（手動インポート・オンデマンド実行のいずれでも同じ検証ロジックを使う）と、Edge Case「検証プレビューで示された見込み件数と実際の実行結果の件数は一致する」を自然に満たす。業者ごとの差異（CSV列構成・スクレイピング方法）は`csv-adapter.ts`の業者別マッピングと`scripts/product-import/vendors/<vendor-id>/`配下のアダプターに閉じ込め、共通ロジックは業者を意識しない。

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

該当なし。

## Post-Design Constitution Re-check

Phase 1（data-model.md / contracts / quickstart.md）完了後の再確認。新規ドキュメントタイプ（`vendor` / `productImportRun` / `productAvailabilityReview`）とオンデマンド実行トリガーAPIの追加により実装対象は増えたが、Constitution Checkの各原則との整合に変化はない。原則Iで挙げたPRの分割方針（JANコード追加／vendor系スキーマ／CSVインポートツール／スクレイピング基盤／オンデマンドトリガーAPI）はdata-model.md・contracts/の内容とも一致しており、`/speckit-tasks`でそのままタスク境界として使える。再判定: 全原則 ✅ PASS。
