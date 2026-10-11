# 並列worktree実装の手引き

複数のissueを、1台のPC上で分離した環境（別git worktree・別ポート・別ローカルSupabase）で並列に実装するための仕組み。ワークツリーとセッションの管理はADEの **Orca** に任せ、このリポジトリはOrcaのsetup/archiveフックから呼ぶスクリプトだけを持つ。

セッションが従うルール（依存の確認・テストの実行方法・自動push・PRの条件）は `CLAUDE.md` の「並列開発（Orca）」を参照。このドキュメントは背景・制約のリファレンス。

## 使い方

1. Orcaでissueを紐づけてワークツリーとエージェントを起動する（Orcaの画面、または `orca worktree create --issue <番号> --agent claude --prompt "..."`）
2. Orcaのsetupフックが `scripts/worktree-setup.sh` を実行し、空きスロットの確保・`config.toml` の書き換え・Supabase起動・`.env.worktree` の生成まで行う
3. あとはセッションに任せる。依存issueが未完了なら止まって報告し、そうでなければ実装からpush・PR作成まで進む
4. 作業が終わったワークツリーをOrcaで片付けると、archiveフックが `scripts/worktree-archive.sh` を実行し、Supabaseを停止してスロットを解放する

## Orcaのリポジトリ設定（初回のみ・手動）

| 項目              | 値                                 |
| ----------------- | ---------------------------------- |
| ベースブランチ    | `origin/develop`                   |
| setupスクリプト   | `bash scripts/worktree-setup.sh`   |
| archiveスクリプト | `bash scripts/worktree-archive.sh` |

## できること・できないこと

| 分離対象                                  | 状態                                                                                   |
| ----------------------------------------- | -------------------------------------------------------------------------------------- |
| ファイルシステム（git worktree、Orca）    | 完全分離                                                                               |
| ローカルSupabase（Docker）                | 完全分離（`scripts/patch-supabase-slot.py`でスロットごとにポート・project_idをずらす） |
| Next.js/Playwrightの開発サーバーポート    | 完全分離（`.env.worktree` の `PORT`）                                                  |
| Clerk・Stripe・Sanity                     | **共有**（同じdevインスタンス・テストモードアカウントを全worktreeで使う）              |
| ngrok・Stripe CLI（`task dev`のフル構成） | **分離しない**。手動確認は同時に1ワークツリー（通常はメインのチェックアウト）で行う    |

Clerk/Sanityの固定テストID（メールアドレス・ブランド/商品ID）は`WORKTREE_SLOT`環境変数でスロットごとに一意化される（`tests/e2e/helpers/clerk-test-invitation.ts`の`slotEmail`/`withSlotSuffix`）。

## スロット割り当て

| スロット | 使う場所                             | アプリポート    | Supabase API     | project_id                |
| -------- | ------------------------------------ | --------------- | ---------------- | ------------------------- |
| 1        | メインのチェックアウト（`task dev`） | 3000            | 54321            | `brand-closed-ec`（既定） |
| 2〜9     | Orcaのワークツリー                   | 3000+(N-1)×1000 | 54321+(N-1)×1000 | `brand-closed-ec-slotN`   |

- スロットの確保状況は、全ワークツリーで共有されるgitの共通ディレクトリ（`<git-common-dir>/worktree-slots/<N>/owner`）に記録する。`mkdir` で確保するため、同時にsetupが走っても重複しない
- 持ち主のワークツリーが消えている確保（archiveが走らなかった場合など）は、次のsetup時に自動で解放・再利用される
- 確保の記録が無くても、`-slotN` のSupabaseコンテナが残っているスロットは使用中として扱う

## Docker負荷の目安

最小構成（api/db/authのみ、CIと同じ`-x`フラグ）なら1worktreeあたり数コンテナ。同時に動かすワークツリーが多いとDocker Desktopのメモリを圧迫するため、使い終わったワークツリーはOrcaで片付ける。
