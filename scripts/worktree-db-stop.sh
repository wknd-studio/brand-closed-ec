#!/usr/bin/env bash
# このワークツリー専用のローカルSupabaseを片付ける（docs/dev-parallel-worktrees.md参照）。
# Supabaseを停止してボリュームを削除し、config.toml を元に戻してスロットを解放する。
# 解放後も scripts/with-worktree-db.sh を実行すれば、空きスロットを確保し直して再び起動する。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
# shellcheck source=scripts/worktree-slot-lib.sh
source "$ROOT/scripts/worktree-slot-lib.sh"

SLOT="$(find_own_slot "$ROOT")"
if [ -z "$SLOT" ]; then
  echo "このワークツリーが確保したスロットはありません。何もせず終了します"
  exit 0
fi

echo "==> スロット${SLOT}のSupabaseを停止（ボリュームも削除）"
# config.toml の project_id（-slotN）に対してだけ効くため、他のワークツリーには影響しない
supabase stop --workdir "$ROOT" --no-backup

git -C "$ROOT" update-index --no-skip-worktree supabase/config.toml
git -C "$ROOT" checkout -- supabase/config.toml
release_slot "$SLOT"
echo "スロット${SLOT}を解放しました"
