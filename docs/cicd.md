# CI/CD

## パイプライン概要

```
PR (develop・main)
  ├─ TypeScript チェック
  ├─ Lint / Format チェック
  ├─ Unit Tests
  └─ E2E Tests（コード変更を含むPRのみ。ローカルSupabase + ローカルdevサーバーで実行）

push (develop・main)
  └─ Deploy
       ├─ [develop] DB マイグレーション (stg) → ビルド → デプロイ → E2E（stg環境に対して）
       └─ [main]    DB マイグレーション (prod) → ビルド → デプロイ
```

| トリガー            | 実行されるジョブ                           |
| ------------------- | ------------------------------------------ |
| PR → develop / main | typecheck・lint・test・E2E（コード変更時） |
| push → develop      | migrate stg → deploy stg → E2E             |
| push → main         | migrate prod → deploy prod                 |

> **PR時のE2Eについて**: `docs/`・`specs/`・`*.md`のみの変更（ドキュメントのみのPR）ではE2Eジョブをスキップする（`dorny/paths-filter`で判定）。実行する場合もstgの本物のDBには触れず、CI実行環境内でSupabaseをローカル起動してテスト用データを使う（PRごとに独立、他のPRのテストと干渉しない）。

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

### 設定済み（追加済み）

| Secret                          | 用途                                                                 |
| ------------------------------- | -------------------------------------------------------------------- |
| `APP_URL_STG`                   | stg の公開 URL                                                       |
| `CLERK_SECRET_KEY_STG`          | stg Clerk Secret Key（E2E テスト用）                                 |
| `SUPABASE_SERVICE_ROLE_KEY_STG` | stg Supabase service_role キー（E2E テストのデータクリーンアップ用） |
| `SUPABASE_ACCESS_TOKEN`         | Supabase CLI 認証トークン（DB マイグレーション用）                   |
| `SUPABASE_PROJECT_REF_STG`      | stg Supabase プロジェクト参照 ID                                     |
| `E2E_USER_EMAIL`                | E2E テスト用アカウントのメールアドレス                               |
| `E2E_USER_PASSWORD`             | E2E テスト用アカウントのパスワード（実ログインフローテスト用）       |

### 要追加（prod 準備時）

| Secret                        | 用途                              |
| ----------------------------- | --------------------------------- |
| `APP_URL_PROD`                | prod の公開 URL                   |
| `STRIPE_PUBLISHABLE_KEY_PROD` | prod Stripe 公開鍵                |
| `SUPABASE_PROJECT_REF_PROD`   | prod Supabase プロジェクト参照 ID |

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

### CI での実行タイミング（2種類）

1. **PR作成・更新時**（`e2e-pr`ジョブ）: `docs/`・`specs/`・`*.md`のみの変更を除き、PRを作成・更新するたびにTypeScript/Lint/Unit Testsと同じタイミングで自動実行される。CI実行環境内でSupabaseをローカル起動し、まっさらなDBにマイグレーションを適用してテストする（本物のstg DBには触れない）。Clerk・Stripe・Sanity等のテスト用シークレットは`staging` Doppler環境から取得する。
2. **`develop`へのpush後**（`e2e`ジョブ、従来通り）: stg デプロイが完了してから自動実行される。stg の応答を最大2分待ってから Playwright を起動し、実際にデプロイされたstg環境に対してテストする。

どちらも失敗したテストの動画・トレースをGitHub ActionsのArtifacts（`playwright-report-pr`・`playwright-report-stg`）としてアップロードする（保持期間7日）。ダウンロードして`.mp4`をそのまま再生するか、`pnpm exec playwright show-trace <trace.zip>`でトレースビューアを開いて確認できる。

### ローカルでの実行

```bash
pnpm test:e2e       # pnpm dev を自動起動してテスト
pnpm test:e2e --ui  # Playwright UI モード（ブラウザの動きをリアルタイムで確認できる）
```

失敗したテストの動画・トレースはローカルでも`test-results/`配下に自動保存される（`playwright.config.ts`の`video: "retain-on-failure"` / `trace: "retain-on-failure"`）。

### 必要な前提条件

E2E テストを実行するには以下が必要：

1. **テスト用 Clerk アカウント**
   - Clerk ダッシュボードでテスト用ユーザーを作成
   - `publicMetadata` に `{ "onboarding_completed": false }` を設定
   - メールアドレスを `E2E_USER_EMAIL`（Doppler の `dev` Config）に設定

2. **環境変数**（ローカルの場合は Doppler、CI の場合は Doppler + GitHub Secrets）

シークレットは `.env.local` 等のローカルファイルではなく Doppler で一元管理する。ローカルで E2E を実行する場合は `task test:e2e`（内部で `doppler run -- pnpm test:e2e` を実行）を使う。

```
E2E_USER_EMAIL=test+clerk_test@example.com
E2E_USER_PASSWORD=...
CLERK_SECRET_KEY=sk_test_...
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### テスト構成

| ファイル                                                     | 内容                                                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/e2e/auth/onboarding.spec.ts`                          | オンボーディングフロー（プラン選択・リダイレクト。`ticket`方式バイパス）                                                                      |
| `tests/e2e/auth/registration.spec.ts`                        | 実際の招待リンク→登録フォーム→プラン選択→Stripe Checkoutまでの実登録フロー                                                                    |
| `tests/e2e/auth/login.spec.ts`                               | 実際のログインフォーム操作＋未知デバイスの確認コード入力                                                                                      |
| `tests/e2e/order/checkout.spec.ts`                           | カタログ〜チェックアウト〜Stripe Checkout画面遷移（住所新規入力・既存選択・月次上限超過）                                                     |
| `tests/e2e/order/invoice.spec.ts`                            | 要相談商品の見積依頼フロー（カタログ〜チェックアウト〜`/order/invoice-complete`遷移）                                                         |
| `tests/integration/webhooks/stripe-checkout-webhook.test.ts` | Stripe決済確定Webhook（`checkout.session.completed`）受信後、注文が`paid`になることの統合テスト                                               |
| `tests/integration/webhooks/stripe-invoice-webhook.test.ts`  | Stripe請求書決済確定Webhook（`invoice.paid`）受信後、注文が`paid`になることの統合テスト                                                       |
| `tests/e2e/helpers/clerk-test-invitation.ts`                 | 招待作成・テストユーザークリーンアップ・オンボーディング完了までの共通処理（`registration.spec.ts`・`checkout.spec.ts`・`invoice.spec.ts`用） |
| `tests/e2e/global.setup.ts`                                  | Clerk テスト環境のセットアップ                                                                                                                |

`E2E_USER_EMAIL`/`E2E_USER_PASSWORD` が未設定の場合、認証済みアクセス・ログインのテストは自動的にスキップされる。`E2E_USER_EMAIL` は Clerk のテスト用メール規約（`+clerk_test` を含むアドレス）で作成すること。

---

## ローカル開発での Webhook テスト

Clerk Webhook をローカルでテストするには ngrok が必要。

```bash
ngrok http 3000
# 表示された URL を Clerk ダッシュボードの Webhook エンドポイントに登録
```

> **注意**: ngrok 起動中は stg の Webhook エンドポイントにも同じイベントが届く。Clerk ダッシュボードで stg エンドポイントを一時的に無効化してから作業すること。
