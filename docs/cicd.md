# CI/CD

## パイプライン概要

```
push / PR (develop・main)
  ├─ TypeScript チェック
  ├─ Lint / Format チェック
  └─ Unit Tests
       └─ [push のみ] Deploy (stg / prod)
                          └─ [develop のみ] E2E Tests (stg)
```

| トリガー            | 実行されるジョブ      |
| ------------------- | --------------------- |
| PR → develop / main | typecheck・lint・test |
| push → develop      | deploy stg → E2E      |
| push → main         | deploy prod           |

> GitHub 無料プランの private リポジトリは branch protection が使えないため、PR なし直接 push のリスクは運用でカバーする。チェックは PR 時のみ実行し、push 時はデプロイのみ行う。

---

## 環境構成

詳細は `requirements.md` の「3. 環境構成」を参照。

| 環境            | ブランチ    | Supabase         | Clerk                                |
| --------------- | ----------- | ---------------- | ------------------------------------ |
| dev（ローカル） | `feature/*` | ローカル Docker  | Development インスタンス（stg 共用） |
| stg             | `develop`   | 専用プロジェクト | Development インスタンス（dev 共用） |
| prod            | `main`      | 専用プロジェクト | Production インスタンス              |

> **Clerk の dev/stg 共用について**: ngrok でローカルを公開している間は Webhook が stg にも届く可能性がある。ローカルで Webhook テストをする際は Clerk ダッシュボードで stg の Webhook エンドポイントを一時的に無効化すること。

---

## GitHub Actions Secrets

GitHub リポジトリの Settings → Secrets and variables → Actions に設定する。

### 既存

| Secret                        | 用途                                 |
| ----------------------------- | ------------------------------------ |
| `CLERK_PUBLISHABLE_KEY_STG`   | stg ビルド時の Clerk 公開鍵          |
| `CLERK_PUBLISHABLE_KEY_PROD`  | prod ビルド時の Clerk 公開鍵         |
| `SUPABASE_URL_STG`            | stg Supabase URL                     |
| `SUPABASE_URL_PROD`           | prod Supabase URL                    |
| `SUPABASE_ANON_KEY_STG`       | stg Supabase anon キー               |
| `SUPABASE_ANON_KEY_PROD`      | prod Supabase anon キー              |
| `STRIPE_PUBLISHABLE_KEY_STG`  | stg Stripe 公開鍵                    |
| `STRIPE_PUBLISHABLE_KEY_PROD` | prod Stripe 公開鍵                   |
| `SANITY_PROJECT_ID`           | Sanity プロジェクト ID（全環境共通） |
| `SENTRY_DSN`                  | Sentry DSN                           |
| `SENTRY_AUTH_TOKEN`           | Sentry ソースマップアップロード用    |
| `CLOUDFLARE_API_TOKEN`        | Wrangler デプロイ用                  |
| `CLOUDFLARE_ACCOUNT_ID`       | Cloudflare アカウント ID             |

### 要追加

| Secret                          | 用途                                                                 |
| ------------------------------- | -------------------------------------------------------------------- |
| `APP_URL_STG`                   | stg の公開 URL（例: `https://stg.example.com`）                      |
| `APP_URL_PROD`                  | prod の公開 URL（例: `https://example.com`）                         |
| `CLERK_SECRET_KEY_STG`          | stg Clerk Secret Key（E2E テスト用）                                 |
| `SUPABASE_SERVICE_ROLE_KEY_STG` | stg Supabase service_role キー（E2E テストのデータクリーンアップ用） |
| `E2E_USER_EMAIL`                | E2E テスト用アカウントのメールアドレス                               |

---

## Cloudflare Workers ランタイムシークレット

ビルド時の環境変数（`NEXT_PUBLIC_*`）とは別に、サーバーサイドのシークレットは Cloudflare Workers に直接設定する必要がある。`selectPlan` Server Action や Webhook ハンドラーが使用する。

```bash
# stg
wrangler secret put CLERK_SECRET_KEY --config wrangler.stg.jsonc
wrangler secret put CLERK_WEBHOOK_SECRET --config wrangler.stg.jsonc
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.stg.jsonc

# prod
wrangler secret put CLERK_SECRET_KEY --config wrangler.prod.jsonc
wrangler secret put CLERK_WEBHOOK_SECRET --config wrangler.prod.jsonc
wrangler secret put SUPABASE_SERVICE_ROLE_KEY --config wrangler.prod.jsonc
```

---

## E2E テスト

### CI での実行タイミング

`develop` への push 後、stg デプロイが完了してから自動実行される。stg の応答を最大2分待ってから Playwright を起動する。

### ローカルでの実行

```bash
pnpm test:e2e       # pnpm dev を自動起動してテスト
pnpm test:e2e --ui  # Playwright UI モード
```

### 必要な前提条件

E2E テストを実行するには以下が必要：

1. **テスト用 Clerk アカウント**
   - Clerk ダッシュボードでテスト用ユーザーを作成
   - `publicMetadata` に `{ "onboarding_completed": false }` を設定
   - メールアドレスを `E2E_USER_EMAIL`（`.env.local` または GitHub Secret）に設定

2. **環境変数**（ローカルの場合は `.env.local`、CI の場合は GitHub Secrets）

```
E2E_USER_EMAIL=test@example.com
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### テスト構成

| ファイル                            | 内容                                               |
| ----------------------------------- | -------------------------------------------------- |
| `tests/e2e/auth/onboarding.spec.ts` | オンボーディングフロー（プラン選択・リダイレクト） |
| `tests/e2e/global.setup.ts`         | Clerk テスト環境のセットアップ                     |

`E2E_USER_EMAIL` が未設定の場合、認証済みアクセスのテストは自動的にスキップされる。

---

## ローカル開発での Webhook テスト

Clerk Webhook をローカルでテストするには ngrok が必要。

```bash
ngrok http 3000
# 表示された URL を Clerk ダッシュボードの Webhook エンドポイントに登録
```

> **注意**: ngrok 起動中は stg の Webhook エンドポイントにも同じイベントが届く。Clerk ダッシュボードで stg エンドポイントを一時的に無効化してから作業すること。
