# Quickstart: 会員登録・ログインフローのE2Eテスト網羅の動作確認

## 前提

- `supabase start`でローカルDBが起動していること
- `.env.local`にClerkテスト用の秘密鍵（`CLERK_SECRET_KEY`）が設定されていること
- テスト用メールアドレスは`+clerk_test`を含むもの（例: `info+clerk_test_starter@wknd-studio.com`）を使う

## 検証シナリオ

### シナリオ1: 実登録フロー（STARTERプランの例。他5ランクも同様）

1. テストの事前準備で、`clerkClient.invitations.createInvitation`を呼び、招待URLを取得する
2. Playwrightで招待URLへ遷移する
3. `/welcome`で利用規約に同意する
4. Clerkの登録フォームにメールアドレス・パスワードを入力する
5. 確認コード入力画面が表示されることを確認し、固定コード`424242`を入力する
6. `/onboarding/plan`へ遷移することを確認する
7. STARTERプランを選択する
8. Stripe Checkout画面へ遷移することを確認する
9. 事後処理でClerkユーザー・Supabase会員レコードを削除する

### シナリオ2: 実ログインフロー（メール2段階認証）

1. テストの事前準備で、テスト用会員をあらかじめ作成しておく（登録済み状態）
2. `/sign-in`へ遷移する
3. メールアドレス・パスワードを入力する
4. 2段階認証コード入力画面が表示されることを確認し、固定コード`424242`を入力する
5. ログイン後の画面（オンボーディング完了済みなら`/shop`）へ遷移することを確認する
6. 事後処理でテスト用会員を削除する

### シナリオ3: 誤ったコードでの失敗確認

1. シナリオ1・2の途中で、意図的に誤ったコード（例: `000000`）を入力する
2. エラーメッセージが表示され、次の画面に進まないことを確認する

## 実行コマンド

```bash
supabase start
pnpm test:e2e tests/e2e/auth/registration.spec.ts tests/e2e/auth/login.spec.ts
pnpm test:e2e:ui   # ブラウザの動きを見ながら確認する場合
```
