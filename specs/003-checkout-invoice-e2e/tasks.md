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

**Goal**: 会員が実際の画面操作でカタログから固定価格商品を購入し、Stripe Checkout画面へ正しく遷移することを保証する（住所の新規入力・既存選択の両経路、月次上限超過時のブロックを含む）。また、Stripeからの決済完了Webhookを受けた際に注文が`paid`になることを保証する

**Independent Test**: `quickstart.md` シナリオ1・1b・2・3

**スコープ訂正（2026-07-25）**: 当初はStripe Checkout画面での実際のカード決済操作までE2Eで行う想定だったが、Stripe公式のボット検知（自動テスト防止）が実機検証で発動することを確認した。決済確定処理（Webhook受信→`paid`化）はE2Eから切り出し、Stripe公式のテストヘルパーを使った統合テスト（T005）として検証する。詳細はresearch.md参照

- [x] T002 [US1] `tests/e2e/order/checkout.spec.ts` を新規作成する。シナリオ1（新規住所入力）: (1) `tests/e2e/helpers/clerk-test-invitation.ts`の`createTestInvitation`で招待URL取得→登録（住所は未登録のまま） (2) カタログ画面でブランド→固定価格商品（STARTERランクでアクセス可能なシード商品）を選択し「カートに追加」 (3) チェックアウト画面で配送先・請求先の住所入力フォームに入力して注文確定 (4) Stripe Checkout画面へ遷移することを確認する（決済操作は行わない） (5) `afterEach`で`cleanupTestUser`によるクリーンアップ（依存: T001）
- [x] T003 [US1] 同ファイルに、シナリオ2（既存住所選択）を追加する: (1) 会員登録後、Supabaseの`addresses`テーブルへ直接住所を作成（`tests/integration/use-cases/place-order.test.ts`の住所作成パターンを踏襲） (2) カタログ→カート追加→チェックアウト画面まではシナリオ1と同様 (3) チェックアウト画面で既存住所を選択（新規入力しない）して注文確定 (4) Stripe Checkout画面へ遷移することを確認する（依存: T002）
- [x] T004 [US1] 同ファイルに、シナリオ3（月次仕入れ上限超過）を追加する: (1) 会員登録後、Supabaseへ当月の確定済み仕入れ金額が上限に近い注文レコードを直接作成（`tests/integration/cart/monthly-confirmed.test.ts`のデータ作成パターンを踏襲） (2) 上限を超える金額の固定価格商品をカートに追加し、チェックアウト画面で注文確定を試みる (3) 上限超過のエラーメッセージが画面に表示され、Stripe Checkout画面へ遷移しないことを確認 (4) Supabaseへの照会で対象注文レコードが作成されていないことを確認 (5) クリーンアップ（依存: T002）
- [x] T005 [US1] `tests/integration/webhooks/stripe-checkout-webhook.test.ts` を新規作成する（シナリオ1b、統合テスト）: (1) `placeOrder`ユースケース経由で実際の注文（`pending_payment`、`stripeCheckoutSessionId`あり）を実DBに作成する (2) Stripe公式のテストヘルパー`stripe.webhooks.generateTestHeaderString({ payload, secret })`で、その`stripeCheckoutSessionId`を含む`checkout.session.completed`イベント（`mode: "payment"`）に正しい署名を付与する (3) `/api/webhooks/stripe`のRoute Handler（`POST`関数）をインポートし、構築した`Request`で直接呼び出す (4) 実Supabaseへの照会で対象注文のステータスが`paid`になることを確認する (5) クリーンアップ

**実装中に発覚した2つの追加の事実（研究事項に追記が必要。research.md参照）**:

1. **Clerkのuser.createdイベントもStripeと同様、外部からのWebhook配信を前提にできない**: 招待経由の新規サインアップ後にSupabaseの`users`行が作成されるのはClerkの`user.created`Webhook経由だが、これはClerk側から実際にネットワーク到達可能なエンドポイント（ngrokトンネル等）にしか配信されず、ローカルの`task dev:ngrok`やCI環境では届かない。既存の`registration.spec.ts`はこの行の作成を待たずに完結するため無関係だったが、本featureで初めて「招待経由の新規サインアップ→オンボーディング完了済み状態でショップ画面を使う」という組み合わせが必要になり顕在化した。Webhookの到着を待つのではなく、`users`行自体をテスト側で直接作成する方式に変更した（`checkout.spec.ts`の`registerAndMarkOnboarded`）
2. **`tests/e2e/helpers/clerk-test-invitation.ts`の`cleanupTestUser`にバグがあった**: (a) Clerk側API呼び出しの失敗がtry/catchされておらず、例外が伝播すると後続のSupabase側の削除が一切実行されない、(b) `users`の削除がテスト中に作成した`addresses`/`orders`からの外部キー制約に阻まれて失敗するのを検知しておらず、テスト用会員行が削除されないまま蓄積していた。両方とも修正済み（既存の`registration.spec.ts`・`onboarding.spec.ts`は住所・注文を作らないためこのバグの影響を受けていなかった）
3. カートへの追加時（`addToCart`）にも月次上限のクライアント側チェックが存在するため、シナリオ3（上限超過）は「カートに追加」→「上限超過となる確定済み注文をDBに作成」の順で行う必要がある（逆順だとカート追加自体がブロックされ、意図した注文確定時のサーバー側チェックを検証できない）

**チェックポイント**: 固定価格商品の購入導線（画面遷移＋決済確定Webhook処理）が独立して動作・テスト可能

---

## Phase 4: User Story 2 - 要相談商品の見積依頼 (Priority: P2)

**Goal**: 会員が実際の画面操作で要相談商品をカートに追加して注文確定すると、Stripeへのリダイレクトなく確認完了画面へ遷移することを保証する。また、Stripeからの請求書決済完了Webhookを受けた際に注文が`paid`になることを保証する

**Independent Test**: `quickstart.md` シナリオ4・4b

- [x] T006 [US2] `tests/e2e/order/invoice.spec.ts` を新規作成する。(1) `beforeAll`で、固定の明示的なドキュメントID（例: `test-invoice-brand-003`・`test-invoice-product-003`）を使い、テスト専用のブランド・要相談商品（`is_negotiable: true`）をSanity APIで作成する（研究事項: 既存シードデータには要相談商品が存在しないため。research.md参照） (2) 招待URL経由で会員登録し、住所も準備する (3) カタログから当該テスト商品を選択し、価格が「要相談」と表示されることを確認 (4) カートに追加してチェックアウト画面へ進み、住所を確定して注文確定 (5) Stripe Checkout画面へは遷移せず`/order/invoice-complete`へ遷移することを確認 (6) Supabaseへの照会で、注文が`payment_flow: "invoice"`・`status: "confirming"`で作成されていることを確認 (7) `afterAll`でSanityのテスト専用ブランド・商品を固定IDを指定して削除し（既存データへの影響なし。研究事項参照）、`afterEach`で`cleanupTestUser`によるClerk・Supabaseのクリーンアップを行う（依存: T001）
- [x] T007 [US2] `tests/integration/webhooks/stripe-invoice-webhook.test.ts` を新規作成する（シナリオ4b、統合テスト。T005と対になるinvoiceフロー版）: (1) `issueInvoice`ユースケース経由で実際の注文（`invoice_sent`、`stripeInvoiceId`あり）を実DBに作成する（運営者側の請求書発行操作自体はBRAND-137で別スコープのため、ここでは前提条件としてユースケースを直接呼ぶ） (2) Stripe公式のテストヘルパー`stripe.webhooks.generateTestHeaderString({ payload, secret })`で、その`stripeInvoiceId`を含む`invoice.paid`イベントに正しい署名を付与する (3) `/api/webhooks/stripe`のRoute Handler（`POST`関数）をインポートし、構築した`Request`で直接呼び出す (4) 実Supabaseへの照会で対象注文のステータスが`paid`になることを確認する (5) クリーンアップ（依存: T006と同じテスト専用Sanity商品を再利用してもよいが、独立実行できるよう自前で用意してもよい）

**実装中に発覚した事実**: `issueInvoice`の月次上限再チェックは見積確定時の合意済み金額（`negotiatedPrices`）の合計で判定されるため、T007のテストデータはSTARTERランクの月次上限（300,000円）を超えない金額（200,000円）にする必要があった。480,000円で組んだ初回実装は`invoice_sent`ではなく`limit_exceeded`になり、テストが意図通りの前提状態を検証できていないことに気づいた。

**チェックポイント**: 要相談商品の見積依頼導線（画面遷移＋決済確定Webhook処理）が独立して動作・テスト可能

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T008 [P] ローカル（`pnpm test:e2e`・`pnpm test:integration`）・CI（`e2e-pr`ジョブ）の両方で新規テストが通過することを確認する（ローカルは`checkout.spec.ts`＋`invoice.spec.ts`同時実行・`stripe-invoice-webhook.test.ts`単体で確認済み。CIはPR作成後に確認）
- [x] T009 [P] `docs/cicd.md`の「テスト構成」表に`checkout.spec.ts`・`invoice.spec.ts`・`stripe-checkout-webhook.test.ts`・`stripe-invoice-webhook.test.ts`を追記する

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: 依存なしで開始できる
- **US1（Phase 3）**: Phase 1完了後に着手できる
- **US2（Phase 4）**: Phase 1完了後、US1とは独立して着手できる（別ファイルのため並行可能）
- **Phase 5 (Polish)**: US1・US2完了後

## Suggested PR Split（CLAUDE.mdのPRサイズ規律に対応・ユーザーとの合意事項）

1. PR1: Phase 1 + Phase 3（T001〜T005） — Stripeロケーター確定＋固定価格商品のチェックアウト画面遷移（住所2経路＋上限超過）＋決済確定Webhookの統合テスト
2. PR2: Phase 4 + Phase 5（T006〜T009） — 要相談商品の見積依頼・決済確定Webhookの統合テスト＋最終確認・ドキュメント更新

## Implementation Strategy

### MVP First

Phase 1 → Phase 3（US1: チェックアウト決済確定）で一旦止めて検証。固定価格商品の購入導線カバレッジだけでも独立した価値がある。

### Incremental Delivery

Phase 1完了後、US1・US2を並行して進められる。全て完了後にPhase 5で最終確認する。
