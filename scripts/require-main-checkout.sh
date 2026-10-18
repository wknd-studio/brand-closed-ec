#!/usr/bin/env bash
# メインのチェックアウト専用のタスク（task dev など）を、Orcaのワークツリー内で実行させないためのガード。
#
# 使い方: bash scripts/require-main-checkout.sh <タスク名>
#
# task dev 一式は with-worktree-db.sh を通らず、スロット1（メインのチェックアウト）のSupabase・ポート3000・
# ngrok・Stripe CLI に固定で接続する。ワークツリーで動かすとメインのチェックアウトの開発サーバー・DBと衝突するため、
# 判定は with-worktree-db.sh と同じく git-common-dir と git-dir が異なるかどうかで行う（docs/dev-parallel-worktrees.md参照）。

set -euo pipefail

TASK_NAME="${1:-dev}"
ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

if [ "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)" = "$(git -C "$ROOT" rev-parse --path-format=absolute --git-dir)" ]; then
  exit 0
fi

cat >&2 <<EOF
\`task ${TASK_NAME}\` はメインのチェックアウト専用のため、ワークツリー内では実行できません。
（スロット1のSupabase・ポート3000・ngrok・Stripe CLIに接続し、メインのチェックアウトの開発サーバー・DBと衝突するため中止しました）

代わりに次の方法を使ってください:
- テスト: \`task test:integration\` / \`task test:e2e\`（このワークツリー専用のSupabaseを自動で起動して使う）
- その他のDBを使うコマンド: \`bash scripts/with-worktree-db.sh <コマンド>\`
- Webhookを含む手動確認: メインのチェックアウトでこのブランチに \`git switch\` してから \`task dev\` を実行する
EOF
exit 1
