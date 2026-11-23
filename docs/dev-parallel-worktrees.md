# 並列worktree実装の手引き

複数のissueを、1台のPC上で分離した環境（別git worktree・別ポート・別ローカルSupabase）で並列に実装するための仕組み。ワークツリーとセッションの管理はADEの **Orca** に任せる。ローカルSupabaseはワークツリーの作成時ではなく、**DBを使うコマンドを初めて実行したときに起動し、タスクの終わりに片付ける**（DBを使わないissueではコンテナを一切立ち上げない。Orcaのsetup/archiveフックにも依存しない）。

セッションが従うルール（依存の確認・DBを使うコマンドの実行方法・片付け・自動push・PRの条件）は `CLAUDE.md` の「並列開発（Orca）」を参照。このドキュメントは背景・制約のリファレンス。

## 使い方

1. Orcaでissueを紐づけてワークツリーとエージェントを起動する（Orcaの画面、または `orca worktree create --issue <番号> --agent claude --prompt "..."`）。Orcaのsetupは `pnpm install` のみでよい
2. あとはセッションに任せる。依存issueが未完了なら止まって報告し、そうでなければ実装からpush・PR作成まで進む
3. DBを使うコマンドは `bash scripts/with-worktree-db.sh <コマンド>` で実行する。初回はスロットの確保・`config.toml` の書き換え・Supabase起動（約25秒）まで自動で行い、2回目以降は起動済みのものを使う
4. PRを作成したら、セッションが `bash scripts/worktree-db-stop.sh` でSupabaseを停止し、スロットを解放する
5. PRがマージされたら、Orcaでワークツリーを削除する

## スクリプト

| スクリプト                       | 役割                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/with-worktree-db.sh`    | スロットの確保（初回）、Supabaseの起動（止まっていれば）、Dopplerの値をこのワークツリーのSupabase・ポートで上書きしてコマンドを実行 |
| `scripts/worktree-db-stop.sh`    | Supabaseの停止とボリューム削除、`config.toml` の復元、スロットの解放                                                                |
| `scripts/worktree-slot-lib.sh`   | スロット管理の共通処理                                                                                                              |
| `scripts/patch-supabase-slot.py` | `config.toml` のポート・project_idをスロット用に書き換える                                                                          |
| `scripts/dev-entry.sh`           | Webhookの入口（ngrok・`stripe listen`）の確保・返却（`task dev` 一式の最初と `task dev:clean` の最後）                              |
| `scripts/dev-run.sh`             | `task dev` 一式のコマンド（Next.js・`stripe listen`・ngrok・Supabase・シード）を、実行した場所のDB・ポートで動かす                  |
| `scripts/seed-if-missing.ts`     | ワークツリーで `task dev` するとき、スロットのDBにテストアカウントが無ければシード（テストアカウント・シナリオのデータ）を投入する  |

`with-worktree-db.sh` が上書きする環境変数: `WORKTREE_SLOT`、`PORT`、`NEXT_PUBLIC_APP_URL`、`NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。

## できること・できないこと

| 分離対象                               | 状態                                                                                                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ファイルシステム（git worktree、Orca） | 完全分離                                                                                                                      |
| ローカルSupabase（Docker）             | 完全分離（`scripts/patch-supabase-slot.py`でスロットごとにポート・project_idをずらす）                                        |
| Next.js/Playwrightの開発サーバーポート | 完全分離（`with-worktree-db.sh` が `PORT` を設定）                                                                            |
| Clerk・Stripe・Sanity                  | **共有**（同じローカル用のClerkインスタンス・テストモードアカウントを全worktreeで使う。Clerkはstgとは別のインスタンス。#686） |
| ngrok・Stripe CLI（Webhookの入口）     | **分離しない**。入口を使える `task dev` は同時に1か所（メインのチェックアウトかワークツリー）だけ（下記「Webhookの入口」）    |

Clerk/Sanityの固定テストID（メールアドレス・ブランド/商品ID）は`WORKTREE_SLOT`環境変数でスロットごとに一意化される（`tests/e2e/helpers/clerk-test-invitation.ts`の`slotEmail`/`withSlotSuffix`）。

## Webhookの入口

`task dev` は、メインのチェックアウトでも Orca のワークツリーでも動く。ワークツリーでは、そのワークツリーのスロットのDB・ポート（3001〜）で Next.js を起動し、ngrok の固定URL（`buffing-flaccid-nutty.ngrok-free.dev`）と `stripe listen` の転送先もそのポートにする（`scripts/dev-run.sh`）。マージ前の手動確認は、ブランチを切り替えずにそのPRのワークツリーで行う（`docs/manual-check.md`）。

- **入口は同時に1か所**: Clerk の Webhook の送り先（ngrok の固定URL）と `stripe listen` は1つしか持てないため、`task dev` 一式（`dev`・`dev:services`・`dev:next`・`dev:stripe`・`dev:ngrok`・`dev:ngrok:spawn`・`dev:clean`）は最初に入口を確保する（`scripts/dev-entry.sh`）。別の場所（メインのチェックアウトを含む）が使用中なら、使用中の場所（パス・ブランチ・issue）を出して止まる
- **確保の記録**: スロットと同じく、gitの共通ディレクトリ（`<git-common-dir>/dev-entry/`）に `mkdir` で作る。`owner`（場所の絶対パス）・`branch`・`pids`（確保した `task` のPID。別ウィンドウの `task dev:ngrok` の分も足す）を記録する
- **返す**: `task dev:clean` が、Next.js・`stripe listen`・ngrok・Sanity Studio を止めてから入口を返す。メインのチェックアウトでは今までどおり Supabase も止める。ワークツリーの Supabase はテストでも使うため止めない（片付けは `worktree-db-stop.sh`）
- **持ち主が消えた入口の回収**: `pids` のプロセスがすべて終了していれば（`task dev` の異常終了・ワークツリーの削除等）、次に `task dev` した場所が回収して確保する。別ウィンドウの ngrok が動いている間は、持ち主のワークツリーが削除済みでも回収しない（固定URLを古い ngrok が持ったままになるため）。その場合は止まって `task dev:clean` を案内し、`task dev:clean` はどこからでも残ったプロセスを止めて入口を返せる。生存はPIDで判定するため、PIDが無関係のプロセスに再利用されると回収されない（持ち主の場所で `task dev:clean` する）
- **ngrok の転送先**: `ngrok.yml` の `addr` をその場所のポートに書き換えた一時的な設定ファイルを作って渡す（`ngrok.yml` 自体は書き換えない）
- **シード**: ワークツリーで `task dev` すると、スロットのDBにテストアカウント（`docs/seed-data.md`。オンボーディングを終えた会員の行）が揃っていなければ、テストアカウントとシナリオのデータを投入する（`scripts/seed-if-missing.ts`）。揃っていれば何もしない（手動確認で変えたデータを入れ直さないため）。メインのチェックアウトでは今までどおり投入しない
- **Sanity Studio**（`sanity dev`、ポート3333）: ポートは固定だが、`task dev` 自体が同時に1か所だけのため衝突しない
- **E2E との関係**: ワークツリーで `task dev` 中に同じワークツリーで `task test:e2e` を実行すると、E2E がそのポートのサーバーを使い回さない（スロット2〜9。下記）ため、ポート使用中のエラーで止まる。E2E の前に `task dev:clean` で止める

## スロット割り当て

| スロット | 使う場所               | アプリポート | Supabase API     | project_id                |
| -------- | ---------------------- | ------------ | ---------------- | ------------------------- |
| 1        | メインのチェックアウト | 3000         | 54321            | `brand-closed-ec`（既定） |
| 2〜9     | Orcaのワークツリー     | 3000+(N-1)   | 54321+(N-1)×1000 | `brand-closed-ec-slotN`   |

- アプリポートは `scripts/worktree-slot-lib.sh` の `app_port_for_slot` で決める（3001〜3008）。1000刻みにするとスロット4が6000（ブラウザが接続を拒否するX11のポート）、スロット5が7000（macOSのAirPlayレシーバーが使うことがある）に当たるため、1つずつずらす。ブラウザのunsafe port・Supabaseのポートと重ならないことは `tests/unit/worktree-slot-port.test.ts` で確認している
- 開発サーバー（`task dev:next`・`pnpm dev`）はポート（メインのチェックアウトは3000、ワークツリーはそのスロットのポート）を明示している。使用中でも次の空きポート（別のスロットのポート）へ移らず、エラーで止まる
- E2E（Playwright）が動いている開発サーバーを使い回す（`reuseExistingServer`）のはスロット1だけ。スロット2〜9は、そのポートが使用中ならエラーで止まる（別スロットのDBにつながったサーバーでテストが走らないようにするため）。いずれも `tests/unit/dev-server-port.test.ts` で確認している
- スロットの確保状況は、全ワークツリーで共有されるgitの共通ディレクトリ（`<git-common-dir>/worktree-slots/<N>/owner`）に記録する。`mkdir` で確保するため、同時に確保が走っても重複しない
- `worktree-db-stop.sh` を実行せずにワークツリーを削除した場合でも、次に別のワークツリーがスロットを確保するときに、持ち主が消えたスロットの残りのコンテナを停止してから再利用する
- 確保の記録が無くても、`-slotN` のSupabaseコンテナが残っているスロットは使用中として扱う（停止に失敗した場合も同様）

## Docker負荷の目安

最小構成（db・auth・rest・kongのみ。CIと同じ`scripts/supabase-start-minimal.sh`で起動し、除外するコンテナは`scripts/supabase-excluded-services.txt`に定義）なら1worktreeあたり4コンテナ・約230MB。DBを使うタスクの間だけ起動し、PR作成後に停止するため、同時に動くのは実際にテスト中のワークツリーの分だけになる。
