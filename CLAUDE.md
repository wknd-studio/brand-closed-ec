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

**main への PR の `Stg E2E Check`**: main への PR は、PR の先端のコミットについて develop への push で動いた `E2E Tests (stg)` が成功していないと red になる（`.github/workflows/stg-e2e-check.yml`。`hotfix/*` は対象外）。develop へのマージ直後に PR を作ると stg の E2E が終わる前に動いて red になるので、`E2E Tests (stg)` が成功してから、PR の Checks で `Stg E2E Check` を開き「Re-run jobs」で再実行すれば green になる（`gh run rerun <実行ID>` でもよい）。stg の E2E が失敗・取り消しなら、先にその実行を直す・再実行して成功させる

---

## 行動ルール

**実装順序**: テストを書く → 失敗を確認 → テストをコミット → 実装 → テスト通過確認 → 実装・生成物・ドキュメントをそれぞれコミット（自動。分け方は下記「コミット形式」）→ ユーザーに作業内容を報告。プッシュ・PRはユーザーの明示的な承認後のみ実行する（例外は下記「並列開発（Orca）」の自動push・PR条件のみ）。push・PR作成前に `task check`（typecheck → lint → ユニットテスト → 統合テスト）がgreenであること。

**ブランチ運用**: 実装開始時は必ず `git fetch origin develop` して最新の develop から feature ブランチを切ること。毎回ユーザーに指示させない。

**issueの依存関係**: 依存はGitHub標準のissue依存関係（Blocked by）にだけ登録する。issue本文の「依存」節には書かない（AI・人間が見る依存グラフの正をここに一本化するため）。起票時に依存が分かれば `gh api -X POST repos/{owner}/{repo}/issues/<後続>/dependencies/blocked_by -F issue_id=<先行issueのid>` で登録する（`id` は `gh api repos/{owner}/{repo}/issues/<番号> --jq .id`。`{owner}/{repo}` は gh が今いるリポジトリに置き換えるので、そのまま書く）。同じファイルを触って衝突するissue同士も、着手順を決めて登録する。全体は `task deps:graph`（HTML）／`task deps:graph -- --json`（着手可能なissueの洗い出し等）で確認する。同じグラフを https://wknd-studio.github.io/brand-closed-ec/ に自動で公開している（`.github/workflows/issue-deps-graph.yml`。developへのマージ・issueの変更・15分ごとの定期実行で更新）。

**並列開発（Orca）**: 複数issueの並列実装はADEのOrcaで、issueごとにワークツリーとセッションを立ち上げて行う（背景・スロット割り当ては `docs/dev-parallel-worktrees.md`）。Orcaのワークツリー内で作業するセッションは以下に従う。

- **環境**: ワークツリーはOrcaが作る。自分で `EnterWorktree` や `git worktree add` をしない
- **担当issue**: `orca worktree current --json` の `linkedIssue` が担当issue。ブランチはOrcaが付けた名前のまま使わず、`git fetch origin develop` のあと `git switch -c feature/<issue番号>-<内容> origin/develop` で切り直す
- **依存の確認**: 着手前に `gh api repos/{owner}/{repo}/issues/<issue番号>/dependencies/blocked_by --jq '.[] | select(.state=="open") | .number'` を実行し、1件でも出たら実装を始めずユーザーに報告して止まる
- **DBを使うコマンド**: 統合テスト・E2Eは `task test:integration` / `task test:e2e`（内部で `with-worktree-db.sh` を通す）で実行する。それ以外の `supabase db reset` 等は、必ず `bash scripts/with-worktree-db.sh <コマンド>` で実行する。このワークツリー専用スロットのSupabaseが止まっていれば自動で起動し、Dopplerの値をそのスロットのものに上書きして実行する。`doppler run -- pnpm test:integration` を直接実行しない（メインのチェックアウト用のスロット1のDBに接続してしまうため、ワークツリー内では統合テスト・E2Eの開始時に失敗するようにしてある）
- **開発サーバー**: ワークツリーで `task dev`（`dev:services`・`dev:next` 等も含む）を使わない。メインのチェックアウト専用の構成（スロット1のDB・ポート3000・ngrok・Stripe CLI）で動くため、実行するとエラーで止まる。Webhookを含む手動確認は、メインのチェックアウトでブランチを `git switch` して行う
- **片付け**: PRを作成したら `bash scripts/worktree-db-stop.sh` でSupabaseを停止し、スロットを解放する（レビュー対応で再びテストが必要になれば、`with-worktree-db.sh` が自動で起動し直す）
- **自動push・PR**: `linkedIssue` が設定されたワークツリーで、そのissueを実装した場合に限り、次の2つを満たせば、ユーザーの承認を待たずに `git push -u origin <ブランチ>` と `gh pr create --base develop --body-file <本文ファイル>` まで進めてよい。PR本文は `.github/pull_request_template.md` の各項目を埋める（該当しない欄は「なし」と書く）。
  - `task check` がgreen
  - レビュー用サブエージェント `spec-reviewer`（`.claude/agents/spec-reviewer.md`）に、`git diff origin/develop...HEAD` の差分・担当issueの本文・関連する `specs/*/spec.md` だけを渡してレビューさせ、重大な指摘を解消済み（指摘と対応はPR本文に書く）

  PR本文冒頭の「レビューの要点」は、人間が最初に読み、残りを読むかを決める欄なので短く書く（空欄だとCIの `PR Review Summary` が失敗する）。
  - **変わる振る舞い**: 利用者・運営者・システムから見て何が変わるかを1〜2行で。変更したファイルの列挙にしない
  - **一番危ない箇所**: `ファイル:行` まで特定し、なぜ危ないか（壊れたら何が起きるか）を1行で添える。複数あっても一番のものだけ
  - **人間に判断してほしいこと**: 仕様の解釈・トレードオフ・マージ後の手作業など、人間の判断が要るものだけ。無ければ「なし」
  - 受け入れ条件ごとの確認結果・実行したチェック・レビューサブエージェントの指摘と対応は、`<details>` の中に今までどおり省略せず書く

  完了後、issue・実施したテスト・PRのURLを簡潔に報告する。それ以外の場合（`linkedIssue` が無い、担当issue以外の変更を含む等）は通常どおり承認を待つ

**PR の粒度**: **1PR = 1目的 = 1issue**。PRタイトルに書くissue番号は1つだけにする。問題になるのは行数ではなく目的の数で、複数の目的をまとめたPRは、不具合時に無関係な変更まで一緒にrevertされる。大きなユーザーストーリーは実装前に1目的ずつのissueへ分割し、各PRが独立してレビュー・デプロイ・revertできる状態にする。

- 一括置換・フォーマット・型の再生成など機械的な変更は、行数が大きくても目的が1つならそのままでよい。PR本文に機械的な変更であること（実行したコマンド等）を書く
- 機械的な変更は、手作業の変更と混ぜずに専用のコミットにまとめ、実行したコマンドをコミットメッセージの最後の段落に `Mechanical-Change: <コマンド>` のtrailerで書く（複数なら1行ずつ・上から順に実行される。`Co-Authored-By:` と同じ段落でよい）。CIの `Mechanical Change Check`（`.github/workflows/mechanical-change-check.yml`）が、親コミットの状態でコマンドを再実行して結果がコミットと一致するかを検査し、一致したコミットはPRのコメントに「CIで再現を確認済み。読まなくてよい」と出す。一致しなければ失敗し、ずれたファイルを出す
  - 書けるコマンドは許可リストだけ: `sed`（GNU sed の構文。`--sandbox` 付きで実行）・`prettier` / `pnpm exec prettier`（`--plugin` 不可）・`pnpm format`・`pnpm exec jscodeshift -t scripts/codemods/...`・`scripts/codemods/` 配下のスクリプト（直接・`bash`・`node`・`pnpm tsx`）。シェルを通さないため `;`・`&&`・`|`・`>`・`$()`・変数展開は使えない。クォートしないグロブ（`src/**/*.ts`）はその時点のgit管理下のファイルに展開される。許可リストは手違いを防ぐためのもので、安全の境界は「forkのPRは対象外・ジョブの権限は `contents: read` だけ・trailer無しのコミット（codemod・設定・依存）は人間が読む」の3点
  - 新しいcodemodを `scripts/codemods/` に足すときは、codemod自体を別のコミット（trailer無し）にする。codemodの中身は人間が読む
  - ローカルでの確認: `pnpm -s tsx scripts/ci/verify-mechanical-changes.ts origin/develop HEAD`（macOSのBSD sedは `--sandbox` が無いため、`sed` のコミットはCIでだけ検査できる）
- ついでのリファクタや無関係な修正は同じPRに混ぜず、別issueにする
- **本番コード**の差分200行（追加＋削除）・本番コードのファイル5つは「分割を検討する目安」とする。超えたら目的が複数混ざっていないかを見直し、1目的のまま超える場合はその旨をPR本文に書く
  - 本番コード = `src/` 配下（domain・use-cases・repositories / queries・infrastructure・app・components 等）とマイグレーションのSQL。テスト・生成物・ドキュメント・CI / 設定（`.github/`・`scripts/` 等）は数えない。TDDでテストを丁寧に書くほど目安を超える、ということが無いようにするため
  - CIの `PR Diff Summary`（`.github/workflows/pr-diff-summary.yml`）が、差分を区分ごとに集計したコメントをPRに付け、push のたびに更新する。区分の判定は `scripts/ci/pr-diff-summary.ts`。ローカルでの確認: `pnpm -s tsx scripts/ci/pr-diff-summary.ts origin/develop HEAD`

**タスク分解**: PRの粒度は、PRを作る時点ではなく、issueを起票してタスクを分解した時点で決める。issueは `.github/ISSUE_TEMPLATE/` のテンプレート（タスク／親issue）から起票する。

- issue と PR は常に1対1にする。1PRに収まらない作業は、起票時に親issue（タスクリスト）＋サブissue（1つ = 1PR）に分ける。1つのissueに複数PRは作らない（Orcaの「1issue = 1ワークツリー = 1ブランチ」と揃える）
- 実装中にやることが増えたら、PRを大きくせず、新しいissueを起票して親issueのタスクリストに追記する。Orcaのセッションは担当issue以外を実装しない
- タスクリストは最初から完璧にしなくてよい。大枠から書き、分かった時点で追記する

**PRのレビュー**: スキーマ・RLS、Webhook、認証・認可、決済・注文・金額計算、CI・権限設定・lintなどのゲート、依存に触れるPRには `high-risk` ラベルが自動で付く（対象パスは `.github/labeler.yml`）。

- `high-risk` ラベルのPRは、人間が差分を精読してからマージする
- それ以外のPRは、CIの結果とPR本文の証拠欄（実施したテスト等）で判断する
- 区分ごとに見るべき観点が違うため、`high-risk` と一緒に区分のラベル（`risk:db`・`risk:webhook`・`risk:auth`・`risk:payment`・`risk:gate`・`risk:deps`）も付く。区分ごとの確認観点は `docs/review-checklists/<区分>.md`（`risk:db` → `db.md`）にあり、CIの `PR Diff Summary` のコメントに、PRが当たった区分ごとの該当ファイルとチェックリストが出る。精読はこのチェックリストに沿って行う
- 対象パスを足すときは、`.github/labeler.yml` の区分と `high-risk` の両方に足す（ずれると `tests/unit/review-checklists.test.ts` が失敗する）
- レビューをすり抜けたバグが出たら、該当パスを `.github/labeler.yml` に加えるか、見落とした観点を `docs/review-checklists/` に足すか、同じバグを検出するlint・テストに変換する

**developのCIが赤のとき**: PRのCIは「CIが動いた時点のdevelop + そのPR」しか見ていないため、別々に通ったPRの組み合わせでdevelopが壊れることがある。developへのpushのたびに `Deploy` ワークフローで TypeScript・Lint・Unit Tests が動き（通らなければ `Deploy (staging)` は動かない）、失敗は依存グラフのページの一番上の帯に出る。

- developのCIが赤なら、新しいPRのマージより、直す・revertすることを優先する。原因のPRがすぐ直せなければ、まずそのマージコミットをrevertする（`git revert -m 1 <マージコミット>` をfeatureブランチで行い、develop向けのPRにする）
- 赤のdevelopに別のPRを重ねてマージしない（どのマージで壊れたかが分からなくなり、stgにも出なくなる）

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

**マイグレーション作成後は必ず`supabase gen types typescript --local > src/types/database.types.ts`を再実行してコミットする。** CIの`Schema Types Drift`ジョブが、ローカルDBから再生成した型とコミット済みファイルの差分を検出し、更新忘れを機械的に防ぐ。`database.types.ts` は `.gitattributes` で `linguist-generated=true` を指定しており、GitHubのPR差分表示では既定で折りたたまれる。正しさは `Schema Types Drift` が検査するので、レビューで中身を読む必要は無い。他の生成物（`pnpm-lock.yaml` 等）も `.gitattributes` に並べてあり、それぞれの正しさの確かめ方は同ファイルのコメントに書いてある。

CIの`Migration Order`が失敗したら、developの最新より新しいタイムスタンプでマイグレーションを作り直す（`supabase migration new`で作り直すかリネームし、`supabase gen types`を再実行する）。

**コミット形式**: `feat(scope): BRAND-XX 説明` (Conventional Commits)。1つのPRのコミットは、次の順に種類ごとに分ける。レビューする人間がテストのコミットだけで「このPRが何を保証するか」を掴み、そのうえで実装を読めるようにするため（TDDの順番そのまま）。

1. テスト（`test(scope): ...`）: 失敗することを確認した状態のテストだけをコミットする。このコミットの時点ではテストが赤でよい（CIのテストはPRの先端（head）のコミットでだけ動き、コミット単位では動かない。pre-commitのlint-staged（eslint・prettier）は通す）。どう失敗したかはPR本文の「実行したチェック」に書く
2. 実装（`feat`・`fix`・`refactor`）: テストを通す本番コード
3. 生成物・機械的な変更（型の再生成・フォーマット・一括置換など）: 上記「PR の粒度」の `Mechanical-Change:` trailer の規約に従い、手作業の変更と混ぜない
4. ドキュメント（`docs`）: spec.md・CLAUDE.md・`docs/` 等

- 該当しないコミットは作らなくてよい（ドキュメントだけのPRなら `docs` だけ、等）。各種類が複数のコミットに分かれてもよい
- レビュー指摘への対応は、この順に並べ直さず、追加のコミットでよい
- コミットの分け方はCIで検査しない（守られないことが続いたら検査を足す）

**言語**: 常に日本語で回答する。

**コンテキスト管理**: 以下のタイミングでは、作業を止めて `/compact`（会話を要約して継続する場合）または `/clear`（完全に区切って次のタスクに移る場合）の実行をユーザーに提案する。(1) PRをマージした直後、(2) spec-kitの1タスク（tasks.md の1項目）が完了した直後、(3) 会話が長くなり関係のない話題（雑談・別機能の相談等）に切り替わった直後。判断に迷う場合は `/compact` を優先して提案する。これらのコマンドはユーザーのCLI操作でのみ実行可能なため、Claude自身が代わりに実行することはできない。
