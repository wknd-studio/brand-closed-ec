#!/usr/bin/env bash
# 並列開発用ワークツリーの片付け（Orcaのarchiveフックから呼ぶ。docs/dev-parallel-worktrees.md参照）。
# このワークツリーのSupabaseを停止してボリュームを削除し、確保していたスロットを解放する。

set -euo pipefail

cd "$(dirname "$0")/.."
WORKTREE_DIR="$(pwd -P)"
# shellcheck source=scripts/worktree-slot-lib.sh
source scripts/worktree-slot-lib.sh

SLOT="$(find_own_slot "$WORKTREE_DIR")"
if [ -z "$SLOT" ]; then
  echo "このワークツリーが確保したスロットはありません。何もせず終了します"
  exit 0
fi

echo "==> スロット${SLOT}のSupabaseを停止（ボリュームも削除）"
# config.toml の project_id（-slotN）に対してだけ効くため、他のワークツリーには影響しない
supabase stop --no-backup || echo "Supabaseの停止に失敗しました（起動していない可能性があります）。スロットの解放は続行します" >&2

release_slot "$SLOT"
rm -f .env.worktree
echo "スロット${SLOT}を解放しました"
