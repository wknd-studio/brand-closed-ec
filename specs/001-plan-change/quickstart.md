# Quickstart: プラン変更（アップグレード・ダウングレード）の動作確認

## 前提

- 7ランクモデル移行（依存spec）が完了していること
- `supabase start` でローカルDBが起動していること
- Stripeテストモードのキーが設定されていること（`docs/collaboration.md` のテストカード情報を使用）

## 検証シナリオ

### シナリオ1: アップグレード

1. STARTERプランで契約中のテスト会員を用意する
2. プラン変更画面からPROプランを選択する
3. 確認画面で「初期費用差分¥45,000」「即時反映」が表示されることを確認する
4. 確定操作を行う
5. **期待結果**: `users.rank = 'pro'`、`users.billing_anchor_day` が当日に更新されている。Stripeダッシュボード（テストモード）でサブスクリプションの価格がPROに変わっていることを確認する

### シナリオ2: ダウングレード

1. PROプランで契約中のテスト会員を用意する
2. プラン変更画面からSTANDARDプランを選択する
3. 確認画面で「適用は次回更新日から」と表示されることを確認する
4. 確定操作を行う
5. **期待結果**: `users.rank` は `'pro'` のまま変わらない。`users.pending_rank = 'standard'`、`users.stripe_subscription_schedule_id` が設定されている
6. Stripe CLIでWebhookイベント（`customer.subscription.updated`、schedule経由）をトリガーし、期末切替をシミュレートする
7. **期待結果**: `users.rank = 'standard'`、`pending_rank = null`、`stripe_subscription_schedule_id = null`

### シナリオ3: ダウングレード予約の取り消し

1. シナリオ2の手順5まで実施する（ダウングレード予約済み状態）
2. プラン変更画面で現在のプラン（PRO）を再度選択する
3. **期待結果**: `pending_rank = null`、`stripe_subscription_schedule_id = null`、`rank` は `'pro'` のまま

## 実行コマンド

```bash
supabase start
supabase db reset   # DBスキーマ変更後
pnpm test           # ユニット・統合テスト
stripe listen --forward-to localhost:3000/api/webhooks/stripe   # Webhookのローカル転送
```
