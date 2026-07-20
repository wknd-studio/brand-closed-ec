# Quickstart: 会員登録・ログインフローのE2Eテスト網羅の動作確認

## 前提

- `supabase start`でローカルDBが起動していること
- `.env.local`にClerkテスト用の秘密鍵（`CLERK_SECRET_KEY`）が設定されていること
- テスト用メールアドレスは`+clerk_test`を含むもの（例: `info+clerk_test_starter@wknd-studio.com`）を使う

## 検証シナリオ

### シナリオ1: 実登録フロー（代表プラン: STARTER）

1. テストの事前準備で、`clerkClient.invitations.createInvitation`を呼び、招待URLを取得する
2. Playwrightで招待URLへ遷移する
3. `/welcome`で利用規約に同意する
4. Clerkの登録フォームにパスワードを入力する（招待によりメールアドレスは既に確認済みのため入力欄は表示されない）
5. `/onboarding/plan`へ遷移することを確認する
6. STARTERプランを選択する
7. Stripe Checkout画面へ遷移することを確認する
8. 事後処理でClerkユーザー・Supabase会員レコードを削除する

### シナリオ2: 実ログインフロー（未知デバイスの確認コード込み）

1. 固定の`E2E_USER_EMAIL`/`E2E_USER_PASSWORD`（`+clerk_test`アドレス。既存の`onboarding.spec.ts`と同じ資産）を使う。動的にユーザーを作成すると、その作成過程が信頼済みデバイスを作ってしまい確認コードが再現できなくなるため、固定アカウントを使い回す
2. 新しいPlaywrightブラウザコンテキストで`/sign-in`へ遷移する
3. メールアドレス・パスワードを入力する
4. `/sign-in/factor-two`へ遷移し確認コード入力欄が表示されることを確認し、`page.getByLabel("Enter verification code").fill("424242")`で固定コードを入力する（入力完了と同時に自動送信される。Continueボタンのクリックは不要）
5. ログイン後の画面（オンボーディング完了済みなら`/shop`）へ遷移することを確認する
6. 事後処理でSupabase会員レコードを削除する（Clerkの固定アカウント自体は削除しない）

### シナリオ3: 誤った確認コードでの失敗確認

1. シナリオ2の途中で、意図的に誤った確認コード（例: `000000`）を入力する
2. エラーメッセージが表示され、ログインが完了しないことを確認する

**注記（2026-07-20、訂正）**: T001の当初調査では確認コードが一度も再現できず「MFA未実装」と判断したが、これは登録とログインを同一ブラウザコンテキストで行ったために「既知のデバイス」と判定されていたことが原因だった。ユーザーがシークレットウィンドウで手動確認したところ、確認コードは実際に要求される。詳細は`research.md`参照。

## 実行コマンド

```bash
supabase start
pnpm test:e2e tests/e2e/auth/registration.spec.ts tests/e2e/auth/login.spec.ts
pnpm test:e2e:ui   # ブラウザの動きを見ながら確認する場合
```
