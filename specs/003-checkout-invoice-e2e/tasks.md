---
description: "Task list template for feature implementation"
---

# Tasks: カタログ〜チェックアウト・決済確定フローのE2Eテスト網羅

**Input**: Design documents from `/specs/003-checkout-invoice-e2e/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Story**: US1=固定価格商品のチェックアウト・決済確定（住所2経路＋月次上限超過）, US2=要相談商品の見積依頼

**Linear**: 本タスク一式はLinear連携スキルを通じて起票する。

## PRサイズについて

User Story 1（T001〜T004）とUser Story 2（T005〜T007）は、それぞれ独立したPRとする（別ペイメントフローで実装・検証の関心が分かれるため。ユーザーとの合意事項）。

---

## Phase 1: Setup

- [x] T001 ローカルで`task dev`を起動し、実際にカタログ→カート→チェックアウト→Stripe Checkout画面まで手動で進めて、Stripe Checkout画面（カード番号・有効期限・CVC入力欄、送信ボタン）の実際のDOM構造を確認し、Playwrightロケーター（`frameLocator`が必要かどうか含む）を確定する（研究事項。research.md参照）

**チェックポイント**: ロケーター確定。以降の実装で迷わず使える

**T001実施中に発覚した重要な事実（research.md参照）**: Stripe Checkoutのカード情報入力欄は`iframe`不要で直接`getByLabel`操作可能。決済完了後のWebhook処理（`onboarding_completed`のtrue化等）には`stripe listen --forward-to`によるWebhook転送が必須で、ローカルは`task dev`（既存の`dev:stripe`タスク）で対応済みだが、CIの`e2e-pr`ジョブには存在しなかったため`.github/workflows/deploy.yml`に追加した（Stripe CLIインストール＋`stripe listen`のバックグラウンド起動）。署名シークレットはDoppler`dev`configに既存の固定値がそのまま使えるため、追加の値受け渡しは不要だった。

---

## Phase 3: User Story 1 - 固定価格商品のチェックアウト・決済確定 (Priority: P1)

**Goal**: 会員が実際の画面操作でカタログから固定価格商品を購入し、Stripe決済後に注文が`paid`になることを保証する。住所の新規入力・既存選択の両経路、月次上限超過時のブロックも含む

**Independent Test**: `quickstart.md` シナリオ1・2・3

- [ ] T002 [US1] `tests/e2e/order/checkout.spec.ts` を新規作成する。シナリオ1（新規住所入力）: (1) `tests/e2e/helpers/clerk-test-invitation.ts`の`createTestInvitation`で招待URL取得→登録（住所は未登録のまま） (2) カタログ画面でブランド→固定価格商品（STARTERランクでアクセス可能なシード商品）を選択し「カートに追加」 (3) チェックアウト画面で配送先・請求先の住所入力フォームに入力して注文確定 (4) Stripe Checkout画面へ遷移することを確認 (5) T001で確定したロケーターでテストカード（`4242424242424242`）決済 (6) 決済完了後の画面へ遷移することを確認 (7) Supabaseへの直接照会で、`expect.poll()`等を使い注文ステータスが`paid`になることを確認（Stripe webhook処理の非同期性を考慮） (8) `afterEach`で`cleanupTestUser`によるクリーンアップ（依存: T001）
- [ ] T003 [US1] 同ファイルに、シナリオ2（既存住所選択）を追加する: (1) 会員登録後、Supabaseの`addresses`テーブルへ直接住所を作成（`tests/integration/use-cases/place-order.test.ts`の住所作成パターンを踏襲） (2) カタログ→カート追加→チェックアウト画面まではシナリオ1と同様 (3) チェックアウト画面で既存住所を選択（新規入力しない）して注文確定 (4) 以降はシナリオ1のStripe決済〜`paid`確認・クリーンアップと同様（依存: T002）
- [ ] T004 [US1] 同ファイルに、シナリオ3（月次仕入れ上限超過）を追加する: (1) 会員登録後、Supabaseへ当月の確定済み仕入れ金額が上限に近い注文レコードを直接作成（`tests/integration/cart/monthly-confirmed.test.ts`のデータ作成パターンを踏襲） (2) 上限を超える金額の固定価格商品をカートに追加し、チェックアウト画面で注文確定を試みる (3) 上限超過のエラーメッセージが画面に表示され、Stripe Checkout画面へ遷移しないことを確認 (4) Supabaseへの照会で対象注文レコードが作成されていないことを確認 (5) クリーンアップ（依存: T002）

**チェックポイント**: 固定価格商品の購入導線が独立して動作・テスト可能

---

## Phase 4: User Story 2 - 要相談商品の見積依頼 (Priority: P2)

**Goal**: 会員が実際の画面操作で要相談商品をカートに追加して注文確定すると、Stripeへのリダイレクトなく確認完了画面へ遷移することを保証する

**Independent Test**: `quickstart.md` シナリオ4

- [ ] T005 [US2] `tests/e2e/order/invoice.spec.ts` を新規作成する。(1) `beforeAll`で、固定の明示的なドキュメントID（例: `test-invoice-brand-003`・`test-invoice-product-003`）を使い、テスト専用のブランド・要相談商品（`is_negotiable: true`）をSanity APIで作成する（研究事項: 既存シードデータには要相談商品が存在しないため。research.md参照） (2) 招待URL経由で会員登録し、住所も準備する (3) カタログから当該テスト商品を選択し、価格が「要相談」と表示されることを確認 (4) カートに追加してチェックアウト画面へ進み、住所を確定して注文確定 (5) Stripe Checkout画面へは遷移せず`/order/invoice-complete`へ遷移することを確認 (6) Supabaseへの照会で、注文が`payment_flow: "invoice"`・`status: "confirming"`で作成されていることを確認 (7) `afterAll`でSanityのテスト専用ブランド・商品を固定IDを指定して削除し（既存データへの影響なし。研究事項参照）、`afterEach`で`cleanupTestUser`によるClerk・Supabaseのクリーンアップを行う（依存: T001）

**チェックポイント**: 要相談商品の見積依頼導線が独立して動作・テスト可能

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T006 [P] ローカル（`pnpm test:e2e`）・CI（`e2e-pr`ジョブ）の両方で新規テストが通過することを確認する
- [ ] T007 [P] `docs/cicd.md`の「テスト構成」表に`checkout.spec.ts`・`invoice.spec.ts`を追記する

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: 依存なしで開始できる
- **US1（Phase 3）**: Phase 1完了後に着手できる
- **US2（Phase 4）**: Phase 1完了後、US1とは独立して着手できる（別ファイルのため並行可能）
- **Phase 5 (Polish)**: US1・US2完了後

## Suggested PR Split（CLAUDE.mdのPRサイズ規律に対応・ユーザーとの合意事項）

1. PR1: Phase 1 + Phase 3（T001〜T004） — Stripeロケーター確定＋固定価格商品のチェックアウト・決済確定（住所2経路＋上限超過）
2. PR2: Phase 4 + Phase 5（T005〜T007） — 要相談商品の見積依頼＋最終確認・ドキュメント更新

## Implementation Strategy

### MVP First

Phase 1 → Phase 3（US1: チェックアウト決済確定）で一旦止めて検証。固定価格商品の購入導線カバレッジだけでも独立した価値がある。

### Incremental Delivery

Phase 1完了後、US1・US2を並行して進められる。全て完了後にPhase 5で最終確認する。
