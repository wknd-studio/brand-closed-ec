# Quickstart: カタログ〜チェックアウト・決済確定フローのE2Eテストの動作確認

## 前提

- `supabase start`でローカルDBが起動していること
- `.env.local`にClerk・Sanity・Stripeのテスト用鍵（`CLERK_SECRET_KEY`・`SANITY_WRITE_TOKEN`・`STRIPE_SECRET_KEY`）が設定されていること
- `pnpm tsx scripts/seed-products.ts`でSTARTERランクの固定価格商品がSanityにシード済みであること（US1で使用）
- テスト用メールアドレスは`+clerk_test`を含むもの（例: `info+clerk_test_checkout@wknd-studio.com`）を使う

## 検証シナリオ

### シナリオ1: 固定価格商品のStripe Checkout画面遷移（新規住所入力・E2E）

1. テストの事前準備で、招待URLを取得し実際の画面操作で会員登録する（住所は登録しない）
2. カタログ画面でブランド→商品を選択し、「カートに追加」する
3. チェックアウト画面へ進み、配送先・請求先の住所入力フォームに入力する
4. 注文を確定し、Stripe Checkout画面へ遷移することを確認する
5. 事後処理でClerkユーザー・Supabase会員レコード・住所・注文レコードを削除する

**注記（2026-07-25、訂正）**: 当初はここでテストカード決済〜`paid`確認まで行う想定だったが、Stripeの公式ボット検知により実際の決済操作は信頼できないことが判明した。決済確定処理の検証はシナリオ1bへ分離した。

### シナリオ1b: Stripe決済確定Webhookの処理（統合テスト）

1. `placeOrder`ユースケース経由で実際の注文（`pending_payment`状態、`stripeCheckoutSessionId`あり）を作成する
2. Stripe公式のテスト用ヘルパー`stripe.webhooks.generateTestHeaderString({ payload, secret })`で、その注文の`stripeCheckoutSessionId`を含む`checkout.session.completed`イベント（`mode: "payment"`）に正しい署名を付与する
3. `/api/webhooks/stripe`のRoute Handler（`POST`関数）を直接呼び出し、署名付きイベントを送信する
4. Supabaseへの直接照会で、対象注文のステータスが`paid`になることを確認する
5. 事後処理でテストデータを削除する

### シナリオ2: 固定価格商品のStripe Checkout画面遷移（既存住所選択・E2E）

1. テストの事前準備で、会員登録済みかつSupabaseへ住所を直接作成した状態を作る
2. カタログ→カート追加→チェックアウト画面まではシナリオ1と同様
3. チェックアウト画面で、既存住所を選択する（新規入力しない）
4. 注文を確定し、Stripe Checkout画面へ遷移することを確認する
5. 事後処理でクリーンアップする

### シナリオ3: 月次仕入れ上限超過時のブロック（E2E）

1. テストの事前準備で、当月の確定済み仕入れ金額が上限に近い会員を作る（Supabaseへ直接注文レコードを作成）
2. 上限を超える金額の固定価格商品をカートに追加し、チェックアウト画面で注文を確定しようとする
3. 上限超過のエラーメッセージが表示され、Stripe Checkout画面へは遷移しないことを確認する
4. 事後処理でクリーンアップする

### シナリオ4: 要相談商品の見積依頼

1. テストの事前準備で、テスト専用の要相談商品をSanity APIで作成する。会員登録・住所も準備する
2. カタログから要相談商品をカートに追加し、チェックアウト画面で価格が「要相談」と表示されることを確認する
3. 注文を確定し、Stripe Checkout画面へは遷移せず`/order/invoice-complete`へ遷移することを確認する
4. Supabaseへの直接照会で、注文が`invoice`フロー・`confirming`ステータスで作成されていることを確認する
5. 事後処理でテスト専用のSanity商品・ブランド、Clerkユーザー、Supabaseレコードを削除する

### シナリオ4b: Stripe請求書決済確定Webhookの処理（統合テスト）

1. `issueInvoice`ユースケース経由で実際の注文（`invoice_sent`状態、`stripeInvoiceId`あり）を作成する（運営者による請求書発行操作自体はBRAND-137で別スコープのため、ここでは前提条件としてユースケースを直接呼ぶ）
2. Stripe公式のテスト用ヘルパー`stripe.webhooks.generateTestHeaderString({ payload, secret })`で、その注文の`stripeInvoiceId`を含む`invoice.paid`イベントに正しい署名を付与する
3. `/api/webhooks/stripe`のRoute Handler（`POST`関数）を直接呼び出し、署名付きイベントを送信する
4. Supabaseへの直接照会で、対象注文のステータスが`paid`になることを確認する
5. 事後処理でテストデータを削除する

## 実行コマンド

```bash
supabase start
pnpm tsx scripts/seed-products.ts
pnpm test:e2e tests/e2e/order/checkout.spec.ts tests/e2e/order/invoice.spec.ts
pnpm test:e2e:ui   # ブラウザの動きを見ながら確認する場合
pnpm test:integration tests/integration/webhooks/stripe-checkout-webhook.test.ts
pnpm test:integration tests/integration/webhooks/stripe-invoice-webhook.test.ts
```
