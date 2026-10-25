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

1. **PR作成・更新時**（`e2e-pr`ジョブ）: `docs/`・`specs/`・`*.md`のみの変更を除き、PRを作成・更新するたびにTypeScript/Lint/Unit Testsと同じタイミングで自動実行される。CI実行環境内でSupabaseをローカル起動し、まっさらなDBにマイグレーションを適用してテストする（本物のstg DBには触れない）。Clerk・Stripe・Sanity等のテスト用シークレットはDopplerのCI専用config（`stg_ci`、GitHub Secretsの`DOPPLER_TOKEN_CI`で参照）から取得する。`stg_ci`は`stg`のbranch configで、ClerkのキーだけをCI専用のClerk開発インスタンスのもので上書きし、それ以外は`stg`の値を引き継ぐ。ローカル開発とClerk Backend APIのレート制限の枠を共有しないためのもの（#299）。ローカルSupabaseのClerk連携（`supabase/config.toml`の`[auth.third_party.clerk] domain`）は共有インスタンスを指しているため、ジョブ内でSupabase起動前にCI専用インスタンスのドメインへ差し替える。
2. **`develop`へのpush後**（`e2e`ジョブ、従来通り）: stg デプロイが完了してから自動実行される。stg の応答を最大2分待ってから Playwright を起動し、実際にデプロイされたstg環境に対してテストする。

どちらもE2Eの失敗でジョブが失敗する（PRはマージをブロックされる）。また、E2Eが失敗したときだけ、Playwrightのレポート（`playwright-report/`・`test-results/`。動画・トレースを含む）をageで暗号化して、GitHub ActionsのArtifacts（`playwright-report-pr-<試行回数>`・`playwright-report-stg-<試行回数>`、保持期間3日）としてアップロードする。成功したときは何も残さない。復号して開く手順は「[失敗時のアーティファクト（暗号化）](#失敗時のアーティファクト暗号化)」。

### main への PR で stg の E2E の結果を確かめる（`Stg E2E Check`）

main への PR（develop → main のリリース）では、`.github/workflows/stg-e2e-check.yml` の `Stg E2E Check` が、PR の先端のコミットについて上記2.（`E2E Tests (stg)`）が成功しているかを確かめる（#487。判定は `scripts/ci/check-stg-e2e.ts`）。stg で E2E が通ったコミットだけを本番に出すため、main のブランチ保護の必須チェックに登録している。

- 成功していれば green。失敗・取り消し・スキップ・まだ動いている・そのコミットでは動いていない場合は red で、どの実行・ジョブかのリンクをジョブのログと Summary に出す
- `hotfix/*` → main の PR は stg を通らないため対象外（green で、対象外であることを出す）
- stg の E2E が終わる前に動いて red になったときは、`E2E Tests (stg)` が成功してから PR の Checks で `Stg E2E Check` を「Re-run jobs」で再実行する（`gh run rerun <実行ID>` でもよい）。既存の PR の向き先を後から main に変えたときも動くよう `edited` でも動かしているため、PR 本文を編集しても再実行される
- develop へ続けてマージすると、stg のデプロイ・E2E は直列化され待っている分が取り消されるため、途中のコミットの `E2E Tests (stg)` は取り消し（スキップ）になることがある。リリースは E2E が動いた develop の先端から作る

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

### Resend メール送信の無効化（`DISABLE_EMAIL_SENDING`）

E2E テストはチェックアウト・Invoice発行等でメール送信コードパスを実際に通過するため、対策なしで実行すると Resend の送信数使用枠を消費してしまう（`e2e-pr`・`e2e`〈stg〉両方）。

`src/lib/email/index.ts` の `getResend()` は `DISABLE_EMAIL_SENDING=true` の場合、実際の Resend クライアントの代わりに何もしないダミークライアントを返す（`emails.send()` は API を呼ばず `{ error: null }` を返す）。**E2Eテスト実行中だけ**無効化され、stgへの通常デプロイ・手動QA時は常に実送信される設計になっている（Doppler側の設定は変更しない）。

- `e2e-pr`ジョブ: CI内で`next dev`をこのジョブ専用に起動する使い捨てサーバーのため、「Run E2E tests」ステップの`doppler run -- env ...`に`DISABLE_EMAIL_SENDING="true"`を直接渡すだけで、他環境に一切影響しない
- `e2e`（stg）ジョブ: `deploy-stg`でデプロイ済みの実際のCloudflare Workerに対してテストするため、Doppler側の値を変えるとstg環境全体（手動QA含む）に影響してしまう。そこで「Run E2E tests」の直前に`wrangler secret put DISABLE_EMAIL_SENDING`でstg Workerのシークレットを一時的に`true`に上書きし、直後（`if: always()`でテスト失敗時も含む）に`wrangler secret delete`で削除して元の状態（未設定＝実送信）に戻す
- `production`環境・Doppler設定には一切触れない（本番は常に実送信する）

---

## 失敗時のアーティファクト（暗号化）

このリポジトリはpublicで、アーティファクトはGitHubにログインした誰でもダウンロードできる。そのため、テストの失敗時に残すものは [age](https://age-encryption.org/) の公開鍵で暗号化し、暗号化したファイル（`.age`）だけをアップロードする。中身に何が含まれていても漏れないよう、値を探して伏せるのではなく暗号化する。

| アーティファクト                       | ジョブ            | 中身                                                                                                                                                                 | 暗号化したファイル             |
| -------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `supabase-logs-integration-<試行回数>` | Integration Tests | ジョブ内で起動したローカルSupabaseの `supabase_*` のコンテナ（Kong・PostgREST・Postgres・Auth等）のログ。統合テストがときどき502で落ちる原因を追うためのもの（#497） | `supabase-logs.tar.gz.age`     |
| `supabase-logs-e2e-pr-<試行回数>`      | E2E Tests (PR)    | 同上                                                                                                                                                                 | `supabase-logs.tar.gz.age`     |
| `playwright-report-pr-<試行回数>`      | E2E Tests (PR)    | `playwright-report/`・`test-results/`（HTMLレポート・動画・trace.zip）。trace.zipにはブラウザの通信（ヘッダー・本文・Cookie）と画面のスナップショットが入る（#513）  | `playwright-report.tar.gz.age` |
| `playwright-report-stg-<試行回数>`     | E2E Tests (stg)   | 同上（stgに対するテスト）                                                                                                                                            | `playwright-report.tar.gz.age` |

どれも保持期間は3日で、失敗したとき（Playwrightのレポートは E2E のステップが失敗したとき）だけ作る。

- **公開鍵**: `scripts/ci/log-recipients.txt` に置く（1行に1つ。`#` 以降はコメント）。上の全てのアーティファクトで同じ鍵を使う
- **秘密鍵**: CI（GitHub secrets・Dopplerを含む）にもリポジトリにも置かない。復号できるのは、秘密鍵を持つ人の手元だけ
- **fail closed**: 公開鍵のファイルが無い・空・不正なとき、ageのインストールや暗号化に失敗したときは、暗号化のステップが失敗し、何もアップロードしない
- **Actionsのログ**: パス・ファイル名・件数・サイズだけを出す。中身は出さない
- **Dopplerのシークレット**: 暗号化のステップには渡していない
- **暗号化の処理**: `scripts/ci/encrypt-artifact.ts`（`<出力先.age> <パス>...` をtar.gzにまとめて暗号化する）。Supabaseのログを集める `scripts/ci/collect-supabase-logs.ts` も、これを使って暗号化する

### 暗号化しないアーティファクト

`.github/workflows/` のアップロードを足すときは、暗号化するか、ここに理由を書いて対象外にする。`tests/unit/workflow-artifacts-encrypted.test.ts` が、全てのアップロードが `.age` だけを置くか、対象外の一覧にあるかを検査する（一覧は同ファイルの `EXEMPT`）。

| アーティファクト           | ワークフロー            | 対象外にする理由                                                                                                                     |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pr-diff-summary`          | PR Diff Summary         | PRの差分を区分ごとに集計したMarkdownで、同じ内容をPRのコメントに公開している。publicなPRの差分から作るだけで、シークレットを読まない |
| `mechanical-change-report` | Mechanical Change Check | 機械的な変更の再実行結果のMarkdownで、同じ内容をPRのコメントに公開している。シークレットを読まない                                   |
| `github-pages`             | Issue Deps Graph        | 依存グラフのページで、GitHub Pagesとして公開するためのもの                                                                           |

### 鍵を作る・追加する

```bash
brew install age
age-keygen -o ~/.config/age/brand-closed-ec-ci-logs.txt  # 秘密鍵。コミットしない・共有しない
age-keygen -y ~/.config/age/brand-closed-ec-ci-logs.txt  # 公開鍵（age1...）を表示する
```

表示された公開鍵（`age1...`）を `scripts/ci/log-recipients.txt` に1行で追記し、PRでコミットする。

- 復号する人を増やすとき: その人の公開鍵を同じファイルに1行ずつ足す。どの秘密鍵でも復号できる
- 鍵を外すとき: その行を消す。消す前に作ったアーティファクトは、外した鍵でも復号できる（最長3日で消える）

### ダウンロードして復号する

`<run-id>` は、失敗したワークフロー実行のURL（`.../actions/runs/<run-id>`）の数字。アーティファクト名の末尾は試行回数（再実行なら2以降）。

Supabaseのログ:

```bash
mkdir -p /tmp/supabase-logs && cd /tmp/supabase-logs
gh run download <run-id> -n supabase-logs-integration-1   # E2Eなら supabase-logs-e2e-pr-1
age -d -i ~/.config/age/brand-closed-ec-ci-logs.txt supabase-logs.tar.gz.age | tar -xzf -
ls supabase-logs/   # docker-ps.txt と <コンテナ名>.log
```

Playwrightのレポート（動画・トレース）:

```bash
mkdir -p /tmp/playwright-report && cd /tmp/playwright-report
gh run download <run-id> -n playwright-report-pr-1   # stgなら playwright-report-stg-1
age -d -i ~/.config/age/brand-closed-ec-ci-logs.txt playwright-report.tar.gz.age | tar -xzf -
ls   # playwright-report/ と test-results/

# 以下はリポジトリのチェックアウトで実行する（Playwrightのバージョンを揃えるため）
pnpm exec playwright show-report /tmp/playwright-report/playwright-report
pnpm exec playwright show-trace /tmp/playwright-report/test-results/<テスト名>/trace.zip
```

動画（`test-results/<テスト名>/video.webm`）はそのままブラウザ等で再生できる。

---

## ローカル開発での Webhook テスト

Clerk Webhook をローカルでテストするには ngrok が必要。

```bash
ngrok http 3000
# 表示された URL を Clerk ダッシュボードの Webhook エンドポイントに登録
```

> **注意**: ngrok 起動中は stg の Webhook エンドポイントにも同じイベントが届く。Clerk ダッシュボードで stg エンドポイントを一時的に無効化してから作業すること。
