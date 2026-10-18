# CLAUDE.md

## 開発コマンド

```bash
pnpm dev                        # 開発サーバー
pnpm typecheck                  # tsc --noEmit
pnpm lint                       # eslint
pnpm format                     # prettier --write
pnpm test                       # Vitest（ユニット・統合）
pnpm test:e2e                   # Playwright E2E
pnpm test:e2e --ui              # Playwright UIモード
task check                      # push・PR前の完了チェック（typecheck → lint → ユニット → 統合）

supabase start                  # ローカルDB起動
supabase migration new <name>   # マイグレーション作成
supabase db reset               # ローカルDBに適用
supabase gen types typescript --local > src/types/database.types.ts

wrangler pages secret put <KEY> # シークレット設定
wrangler pages deployment tail  # ログ確認
sanity deploy                   # Sanity Studio デプロイ
```

## 技術スタック

Next.js 16 App Router + TypeScript strict / Cloudflare Pages + Workers (`@cloudflare/next-on-pages`) / Supabase PostgreSQL + RLS + supabase-js / Clerk (RBAC) / Stripe Checkout (SAQ A) / Sanity v3 / Playwright E2E / GitHub Actions CI / Linear (BRAND プロジェクト)

## ライブラリ別実装ガイド

- **Next.js**: `docs/ai-prompts/nextjs.md`を必ず参照すること
- **Clerk**: `docs/ai-prompts/clerk.md` を必ず参照すること（非推奨APIの使用禁止・`<Show>` コンポーネントの使用など重要なルールあり）
- **Sentry**: `docs/ai-prompts/sentry.md` を必ず参照すること（catchブロックでの`Sentry.captureException`送信・`setUser`のスコープに関する重要なルールあり）

## Gitブランチ戦略（厳守）

**CRITICAL: 以下のルールを絶対に破ってはならない。**

```
main      →  本番（prod）自動デプロイ
develop   →  ステージング（stg）自動デプロイ
feature/* →  Cloudflare Pages Preview URL
```

**PR のターゲットブランチ**:

- `feature/*` → **`develop`**（通常の開発作業は常にここ）
- `develop` → `main`（stg での QA 完了後のみ）
- `hotfix/*` → `main`（緊急修正のみ。直後に `develop` へバックマージ必須）

**禁止事項**:

- `feature/*` から `main` への直接 PR・マージ（絶対禁止）
- `main` への直接 push（絶対禁止）

詳細は `requirements.md` の「4. Gitブランチ戦略」を参照。

---

## 行動ルール

**実装順序**: テストを書く → 失敗を確認 → 実装 → テスト通過確認 → コミット（自動）→ ユーザーに作業内容を報告。プッシュ・PRはユーザーの明示的な承認後のみ実行する（例外は下記「並列開発（Orca）」の自動push・PR条件のみ）。push・PR作成前に `task check`（typecheck → lint → ユニットテスト → 統合テスト）がgreenであること。

**ブランチ運用**: 実装開始時は必ず `git fetch origin develop` して最新の develop から feature ブランチを切ること。毎回ユーザーに指示させない。

**issueの依存関係**: 依存はGitHub標準のissue依存関係（Blocked by）にだけ登録する。issue本文の「依存」節には書かない（AI・人間が見る依存グラフの正をここに一本化するため）。起票時に依存が分かれば `gh api -X POST repos/wknd-studio/brand-closed-ec/issues/<後続>/dependencies/blocked_by -F issue_id=<先行issueのid>` で登録する（`id` は `gh api repos/wknd-studio/brand-closed-ec/issues/<番号> --jq .id`）。同じファイルを触って衝突するissue同士も、着手順を決めて登録する。全体は `task deps:graph`（HTML）／`task deps:graph -- --json`（着手可能なissueの洗い出し等）で確認する。同じグラフを https://wknd-studio.github.io/brand-closed-ec/ に自動で公開している（`.github/workflows/issue-deps-graph.yml`。developへのマージ・issueの変更・15分ごとの定期実行で更新）。

**並列開発（Orca）**: 複数issueの並列実装はADEのOrcaで、issueごとにワークツリーとセッションを立ち上げて行う（背景・スロット割り当ては `docs/dev-parallel-worktrees.md`）。Orcaのワークツリー内で作業するセッションは以下に従う。

- **環境**: ワークツリーはOrcaが作る。自分で `EnterWorktree` や `git worktree add` をしない
- **担当issue**: `orca worktree current --json` の `linkedIssue` が担当issue。ブランチはOrcaが付けた名前のまま使わず、`git fetch origin develop` のあと `git switch -c feature/<issue番号>-<内容> origin/develop` で切り直す
- **依存の確認**: 着手前に `gh api repos/wknd-studio/brand-closed-ec/issues/<issue番号>/dependencies/blocked_by --jq '.[] | select(.state=="open") | .number'` を実行し、1件でも出たら実装を始めずユーザーに報告して止まる
- **DBを使うコマンド**: 統合テスト・E2Eは `task test:integration` / `task test:e2e`（内部で `with-worktree-db.sh` を通す）で実行する。それ以外の `supabase db reset` 等は、必ず `bash scripts/with-worktree-db.sh <コマンド>` で実行する。このワークツリー専用スロットのSupabaseが止まっていれば自動で起動し、Dopplerの値をそのスロットのものに上書きして実行する。`doppler run -- pnpm test:integration` を直接実行しない（メインのチェックアウト用のスロット1のDBに接続してしまうため、ワークツリー内では統合テスト・E2Eの開始時に失敗するようにしてある）
- **開発サーバー**: ワークツリーで `task dev`（`dev:services`・`dev:next` 等も含む）を使わない。メインのチェックアウト専用の構成（スロット1のDB・ポート3000・ngrok・Stripe CLI）で動くため、実行するとエラーで止まる。Webhookを含む手動確認は、メインのチェックアウトでブランチを `git switch` して行う
- **片付け**: PRを作成したら `bash scripts/worktree-db-stop.sh` でSupabaseを停止し、スロットを解放する（レビュー対応で再びテストが必要になれば、`with-worktree-db.sh` が自動で起動し直す）
- **自動push・PR**: `linkedIssue` が設定されたワークツリーで、そのissueを実装した場合に限り、`task check` がgreenなら、ユーザーの承認を待たずに `git push -u origin <ブランチ>` と `gh pr create --base develop` まで進めてよい。完了後、issue・実施したテスト・PRのURLを簡潔に報告する。それ以外の場合（`linkedIssue` が無い、担当issue以外の変更を含む等）は通常どおり承認を待つ

**PR サイズ**: 1つのPRは1つの責務に絞る。大きなユーザーストーリーは実装前に小さな単位に分割し、各PRが独立してレビュー・デプロイ可能な状態にする。目安は差分200行以内・変更ファイル5つ以内。分割できない場合はその理由をPR説明に明記する。

**テスト自動選択ルール**: 機能を実装するたびに、以下の基準で必要なテストを自動的に作成する。

| 実装内容                       | テスト種別         | ツール               |
| ------------------------------ | ------------------ | -------------------- |
| 純粋な計算・バリデーション関数 | ユニットテスト     | Vitest               |
| RLSポリシーを含むスキーマ変更  | 統合テスト（実DB） | Vitest + supabase-js |
| APIルート（DB読み書きあり）    | 統合テスト（実DB） | Vitest + supabase-js |
| Stripe Webhookハンドラー       | 統合テスト         | Vitest               |
| クリティカルな業務フロー全体   | E2Eテスト          | Playwright           |
| UIの見た目・レイアウト         | 不要               | —                    |

統合テストでは `SUPABASE_SERVICE_ROLE_KEY` を使い実際のローカルDBに接続する。テストの前後で作成したデータを必ずクリーンアップする（`beforeAll`/`afterAll`）。

**変更した層ごとの確認ルール**: DBスキーマ変更がアプリケーションコードに波及するとき（エンティティ→リポジトリ→ユースケース→APIルート/Webhookの順で影響する）、上位の層だけテストして終わらせず、触った層ごとに対応する確認を必ず行う。テストピラミッド（下ほど速く安く、上ほど遅く高い）に沿って、下から積み上げる。

| 触った層                                                 | 確認方法                                                                                  | 目的                                                                                                                                  |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/entities/*`, `src/domain/value-objects/*`    | ユニットテスト（DBもモックも無し）                                                        | ロジック・計算の分岐が正しいか                                                                                                        |
| `src/infrastructure/supabase/*`（リポジトリ実装）        | 統合テスト（実DB接続）                                                                    | 実際のSELECT/RLSがエラーにならず通るか（`SelectQueryError`等はここで初めて表面化する）                                                |
| `src/use-cases/*`                                        | ユニットテスト（リポジトリをモック）                                                      | Webhook再配信時の冪等性・ロールバック等の分岐                                                                                         |
| `src/app/api/**`（Webhookハンドラー・APIルート）         | 統合テスト（実DB + 実際のHTTPリクエスト）                                                 | ルーティング・署名検証を含めた一連の処理                                                                                              |
| 会員登録〜決済のような複数画面をまたぐクリティカルフロー | E2E（Playwright）。**新規追加は最小限**、既存フローに影響する変更は該当specを実行して確認 | 実際にブラウザで動くか。テストDBのテーブル定義変更時は`tests/e2e/`内の`.insert()`/`.update()`/`.select()`も対象に含める（下記の理由） |

`tests/e2e/`配下のSupabase admin clientは必ず`createClient<Database>(...)`のように型を付ける（型無しの`createClient(...)`は、存在しないカラムを指定してもtscがコンパイルエラーを出さず、実行時までカラム不整合に気づけない。過去に実際にこれで検出漏れが発生した）。

**マイグレーション作成後は必ず`supabase gen types typescript --local > src/types/database.types.ts`を再実行してコミットする。** CIの`Schema Types Drift`ジョブが、ローカルDBから再生成した型とコミット済みファイルの差分を検出し、更新忘れを機械的に防ぐ。

CIの`Migration Order`が失敗したら、developの最新より新しいタイムスタンプでマイグレーションを作り直す（`supabase migration new`で作り直すかリネームし、`supabase gen types`を再実行する）。

**コミット形式**: `feat(scope): BRAND-XX 説明` (Conventional Commits)

**言語**: 常に日本語で回答する。

**コンテキスト管理**: 以下のタイミングでは、作業を止めて `/compact`（会話を要約して継続する場合）または `/clear`（完全に区切って次のタスクに移る場合）の実行をユーザーに提案する。(1) PRをマージした直後、(2) spec-kitの1タスク（tasks.md の1項目）が完了した直後、(3) 会話が長くなり関係のない話題（雑談・別機能の相談等）に切り替わった直後。判断に迷う場合は `/compact` を優先して提案する。これらのコマンドはユーザーのCLI操作でのみ実行可能なため、Claude自身が代わりに実行することはできない。
