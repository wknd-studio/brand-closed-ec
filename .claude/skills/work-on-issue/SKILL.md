---
name: work-on-issue
description: brand-closed-ecのGitHub issue番号を1つ渡すと、そのissue専用の分離環境（git worktree + 独立したローカルSupabaseスタック）を自動セットアップし、CLAUDE.mdのTDDフローで実装を進めてpushとPR作成まで自走するスキル。複数のClaude Codeセッションを別ウィンドウで立ち上げ、それぞれに別のissueを担当させて並列実装したいときに、各セッションで`/work-on-issue <issue番号>`として使う。ユーザーから「issue #NNNをやって」「並列で実装を進めたい」「worktreeで分離して」と言われたときも使うこと。
---

# work-on-issue

GitHub issue番号を受け取り、環境構築から実装・push・PR作成までを1本の流れで自走する。ユーザーがやることは「どのセッションにどのissueを割り振るか」の意思決定だけにするのが目的なので、途中の機械的な判断（空きスロットの選択、環境変数の設定等）は指示を仰がずこのスキル自身が決める。ただし通常のCLAUDE.mdルール通り、実装内容そのものの設計判断で本当に迷う場面は質問してよい。

引数: issue番号（例: `/work-on-issue 226`）。無ければユーザーに聞く。

## 全体の流れ

1. [ブランチを最新develop起点にする](#1-ブランチを最新develop起点にする)
2. [issueと依存関係を確認する](#2-issueと依存関係を確認する)
3. [worktreeへ切り替える](#3-worktreeへ切り替える)
4. [このworktree専用のSupabaseを起動する](#4-このworktree専用のsupabaseを起動する)
5. [CLAUDE.mdのTDDフローで実装する](#5-tddフローで実装する)
6. [push・PR作成まで自分で行う](#6-pushpr作成まで自分で行う)

## 1. ブランチを最新develop起点にする

このリポジトリはGitのorigin HEADが`main`だが、feature branchは必ず`develop`から切る運用（CLAUDE.md「ブランチ運用」節）。`.claude/settings.json`の`worktree.baseRef`は`"head"`に設定済みなので、`EnterWorktree`は「今のlocal HEAD」から分岐する。つまり以下を**worktreeに入る前に**実行し、local HEADをdevelopの最新にしておく必要がある。

```bash
git fetch origin develop
git checkout develop
git merge --ff-only origin/develop
```

## 2. issueと依存関係を確認する

```bash
gh issue view <issue番号>
gh issue view 165   # 依存グラフ（Mermaid図2枚）。GitHubのBlocked byもissueページで確認できる
```

依存しているissueがまだクローズされていない場合は、実装を始めずユーザーに報告して止める（依存先が未完了のまま進めると手戻りが大きいため）。issueが見つからない・すでにクローズ済みなら、その旨を報告して止める。

## 3. worktreeへ切り替える

Claude Code標準の`EnterWorktree`ツールを使う。独自の`git worktree add`スクリプトは使わない（1のとおりbaseRef設定済みなので、これだけでdevelop起点のworktreeになる）。

```
EnterWorktree(name: "issue-<issue番号>")
```

以降、このセッションの作業ディレクトリは自動でworktree内に切り替わる。

## 4. このworktree専用のSupabaseを起動する

ローカルSupabase（Docker）は、`supabase/config.toml`のポート・`project_id`が同一マシン上の全worktreeで共通のため、素のまま`supabase start`すると他のworktree（他のissueを担当している別セッション）と衝突する。これを避けるため、空いている「スロット番号」（1〜4）を使ってポート・project_idをこのworktree内だけでローカルに書き換える。

**空きスロットの検出**: 他のセッションが今どのスロットを使っているかは、稼働中のDockerコンテナ名で分かる（`project_id`にスロット番号が入るため）。

```bash
docker ps --format '{{.Names}}' | grep -oE 'slot[1-4]' | sort -u
```

出ていない番号のうち最小のものを使う（全部埋まっていたら最大4並列に達しているので、ユーザーにその旨を報告して止める）。スロット1（サフィックス無し）は、まだ何も使っていなければ最初の候補にしてよい。

**環境構築**（スロット番号を`N`とする。`N=1`ならこの手順は丸ごとスキップしてよい＝素のconfig.tomlのまま使う）:

```bash
python3 scripts/patch-supabase-slot.py supabase/config.toml <N>
git update-index --skip-worktree supabase/config.toml
pnpm install
supabase start -x storage,imgproxy,realtime,edge-runtime,functions,analytics,vector,inbucket,studio,meta
supabase db reset
```

`-x`で指定したサービス（Studio等）はCIと同じ理由（4並列時のDocker負荷を抑える）で起動しない。DBを目視で確認したくなった場合は、このworktree内で`supabase stop`してから`supabase start`（`-x`無し）を単体実行すればよい。

`supabase status -o env`の出力（`API_URL`/`PUBLISHABLE_KEY`/`SECRET_KEY`）と、アプリのポート（`3000 + (N-1)*1000`。N=1なら3000）を、以降のテスト実行時に環境変数として渡す。例えばスロット2なら：

```bash
NEXT_PUBLIC_SUPABASE_URL=<API_URL> NEXT_PUBLIC_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY> SUPABASE_SERVICE_ROLE_KEY=<SECRET_KEY> pnpm test:integration
NEXT_PUBLIC_SUPABASE_URL=<API_URL> NEXT_PUBLIC_SUPABASE_ANON_KEY=<PUBLISHABLE_KEY> SUPABASE_SERVICE_ROLE_KEY=<SECRET_KEY> PORT=4000 NEXT_PUBLIC_APP_URL=http://localhost:4000 WORKTREE_SLOT=2 pnpm test:e2e
```

`WORKTREE_SLOT`は、E2Eの固定テストメール・Sanity固定ID（`tests/e2e/helpers/clerk-test-invitation.ts`の`slotEmail`/`withSlotSuffix`）を自動で一意化するために使われる。設定を忘れると、他のworktreeで同じspecが同時に走っている場合にテストデータが衝突しうる。

Clerk・Stripe・Sanityは開発用アカウントを全worktreeで共有する（分離しない）。Doppler経由のシークレットはそのまま`doppler run --`で使ってよい（Supabase関連の値だけ上記のように上書きする）。

## 5. TDDフローで実装する

ここからはCLAUDE.mdの通常ルールに従う: テストを書く→失敗を確認→実装→テスト通過確認→コミット。ブランチ名は`feature/<issue番号>`（EnterWorktreeが自動生成した名前と食い違っていても実害はないが、気になる場合はここで`git branch -m`しておく）。

typecheck・lint・unit・統合テスト（4の環境変数を使う）をすべてgreenにしてからコミットする。

## 6. push・PR作成まで自分で行う

この並列実装ワークフローに限り、テストがgreenになったら**ユーザーの承認を待たずに**push・PR作成まで進めてよい（通常の1対1のやり取りでは、CLAUDE.md「実装順序」節の通りpushとPRはユーザー承認後のみという原則が適用される。これはこのスキル経由で実装するとき限定の取り決め）。

```bash
git push -u origin feature/<issue番号>
gh pr create --base develop --head feature/<issue番号> --title "..." --body "..."
```

完了したら、issueの内容・実施したテスト・PRのURLを簡潔にユーザーへ報告する。作業が終わったworktreeは、ユーザーが片付けを指示したときに`ExitWorktree(action: "remove")`で削除する（勝手に消さない。作業内容を後で見返したい場合もあるため）。
