# Implementation Plan: 商品別支払いタイミング設定とカート分割注文

**Branch**: `004-split-order-payment-timing` | **Date**: 2026-07-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/004-split-order-payment-timing/spec.md`

**Note**: This template is filled in by the `/speckit-plan` command; its definition describes the execution workflow.

## Summary

商品の支払いタイミング(`payment_timing`: 注文時払い/注文後払い)をSanityで設定可能にし、カートに両方が混在する場合はチェックアウト時に自動で2件のOrder(checkout/invoiceそれぞれの既存フローに乗せる)へ分割する。分割された2件は共通の`split_group_id`で関連付ける。月次上限チェックは分割前のカート合計(価格確定商品のみ)に対して一度だけ行い、超過時は両方ブロックする。技術的には既存の`selectOrderFlow`(単一フロー判定)を分割ロジックに置き換え、`place-order.ts`ユースケースが状況に応じて1件または2件のOrderを作成するように変更する。既存の「全商品が同一タイミング」のケースは後方互換を保つ。

## Technical Context

**Language/Version**: TypeScript 5 (strict mode) / Next.js 16 App Router (React 19)

**Primary Dependencies**: `@supabase/supabase-js`（注文・ユーザーデータ永続化）、`next-sanity` / `@sanity/client`（商品カタログ）、`stripe`（Checkout Session・Invoice発行）、`@clerk/nextjs`（認証）

**Storage**: Supabase PostgreSQL（`orders` / `order_items`テーブル。本機能で`orders.split_group_id`列を追加）、Sanity（`product`ドキュメントに`payment_timing`フィールドを追加）

**Testing**: Vitest（ユニット: `tests/unit/`、統合: `tests/integration/`＋実Supabaseローカルインスタンス）、Playwright（E2E: `tests/e2e/`）

**Target Platform**: Cloudflare Pages / Workers（`@cloudflare/next-on-pages`）

**Project Type**: Web application（単一Next.jsリポジトリ、ドメイン層/ユースケース層/インフラ層に分離したレイヤードアーキテクチャ）

**Performance Goals**: 特になし。分割チェックアウトが単一フローのチェックアウトと比較して体感できる遅延を生まないこと（Order作成が1件→最大2件になるがDB書き込みは同期処理内で完結）

**Constraints**: 既存の単一フロー（全商品checkout/全商品invoice）の挙動・DBスキーマ・Stripe連携仕様を破壊しないこと（後方互換）。月次上限判定のロジック（`checkMonthlyLimit`）を分割前提で壊さないこと

**Scale/Scope**: 会員制クローズドEC。注文数は一般消費者向けECと比較して少量（会員ごとの月次上限が存在する業務利用規模）

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. エンジニアリング制約はCLAUDE.mdを正とする**: PASS。実装フェーズはユーザーと合意済みの5フェーズ（Sanityスキーマ→Supabaseマイグレーション→ドメインロジック→place-order書き換え→UI/通知調整）に分割し、各フェーズを独立したPR（CLAUDE.mdのPRサイズ目安：差分200行・変更ファイル5つ以内）として実装する想定。各フェーズでテスト自動選択ルール（純粋なドメインロジックはVitestユニット、DB読み書きを伴うuse-caseは実Supabaseでの統合テスト）に従う。
- **II. 受け入れ条件の明記**: PASS。spec.mdの各User Storyに「Acceptance Scenarios」（Given/When/Then、会員・運営者が確認できる観点）と、独立した「Functional Requirements」（システムが保証する観点）の2区分を設けている。
- **III. 曖昧さの解消を計画より先に行う**: PASS。spec.md作成前の対話でスコープ上の分岐点（価格未確定商品の扱い、Invoice送信タイミング、月次上限超過時の挙動、分割注文の関連付け方法）をユーザーと確認済みで、spec.mdに[NEEDS CLARIFICATION]マーカーは残っていない。
- **IV. 実装記述と仕様意図の区別**: PASS。本specは「これから実現したいあるべき仕様」であり、`docs/`配下の実装記述ドキュメントを書き換えるものではない。
- **V. 事実の単一情報源化**: PASS。月次上限額・ランク順序等の既存の事実（`src/domain/value-objects/member-rank.ts`）は本機能で再定義せず、既存の単一情報源をそのまま参照する。

**Post-Design Re-check（Phase 1完了後）**: research.md・data-model.md・contracts/・quickstart.mdの内容は上記5原則いずれにも抵触しない。新規テーブル・新規レイヤー・新規プロジェクトの追加はなく、既存の`Order`/`CartItem`/`ProductSnapshot`への項目追加と、既存パターンを踏襲したバリデーション関数・分割関数の追加にとどまる。PASS。

## Project Structure

### Documentation (this feature)

```text
specs/004-split-order-payment-timing/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md        # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
src/
├── sanity/schemas/
│   └── product.ts                          # payment_timingフィールド追加 + is_negotiableとの矛盾防止バリデーション
├── domain/
│   ├── entities/
│   │   └── order.ts                        # splitGroupId フィールド追加
│   ├── value-objects/
│   │   └── cart-item.ts                    # paymentTiming フィールド追加（Sanityから取得）
│   └── services/
│       └── order-flow-selector.ts          # selectOrderFlow(単一フロー判定)を分割ロジックに置き換え
├── repositories/
│   ├── product-repository.ts               # ProductSnapshotにpaymentTiming追加
│   └── order-repository.ts                 # findBySplitGroupId等、関連注文取得用メソッド追加を検討
├── use-cases/
│   ├── place-order.ts                      # 本機能の中心。1件 or 2件のOrder作成に対応
│   └── issue-invoice.ts                    # 固定価格商品が混在するinvoiceグループでも壊れないことを確認
├── infrastructure/
│   ├── sanity/sanity-product-repository.ts
│   └── supabase/supabase-order-repository.ts # split_group_id列の読み書き対応
├── lib/cart/
│   └── types.ts                            # クッキー保存カート型にpaymentTiming追加
├── components/
│   ├── cart-sidebar.tsx                    # 支払いタイミング別グループ表示・小計
│   └── add-to-cart-button.tsx              # カート追加時にpaymentTimingをコピー
└── app/
    ├── (member)/order/
    │   ├── checkout/                       # チェックアウト画面：グループ表示・分割時のredirect先決定ロジック
    │   ├── complete/                       # チェックアウト完了ページ：関連するinvoice注文の表示
    │   └── invoice-complete/               # invoice発行待ちページ：関連するcheckout注文の表示
    └── admin/orders/                       # 管理画面：split_group_idによる関連注文表示

supabase/migrations/
└── <timestamp>_add_split_group_id_to_orders.sql

tests/
├── unit/
│   ├── sanity/                             # payment_timingバリデーションのユニットテスト
│   ├── use-cases/                          # place-order分割ロジックの単体テスト（helpers.ts拡張）
│   ├── cart-*.test.ts                      # カートのグループ化ロジックの単体テスト
│   └── order-flow-selector.test.ts         # 分割判定ロジックのテスト
└── integration/
    └── use-cases/place-order.test.ts       # 実Supabaseでの2件Order作成・split_group_id検証
```

**Structure Decision**: 既存のレイヤードアーキテクチャ（`domain` → `use-cases` → `repositories`(interface) → `infrastructure`(implementation) → `app`(Next.js App Router)）をそのまま踏襲する。新規レイヤーや新規プロジェクトは追加しない。

## Complexity Tracking

該当なし（Constitution Checkに違反なし）。
