#!/usr/bin/env bash
# このワークツリー専用のローカルSupabaseを使ってコマンドを実行する（docs/dev-parallel-worktrees.md参照）。
#
# 使い方: bash scripts/with-worktree-db.sh <コマンド...>
#   例: bash scripts/with-worktree-db.sh pnpm test:integration
#       bash scripts/with-worktree-db.sh pnpm test:e2e
#       bash scripts/with-worktree-db.sh supabase db reset
#
# - 初回はスロット（2〜9）を確保して config.toml をそのスロット用に書き換える（スロット1はメインのチェックアウト用）
# - Supabaseが止まっていれば起動する（約25秒）。動いていればそのまま使う
# - Dopplerのシークレットに、Supabase関連・ポート等の値をこのワークツリーのもので上書きしてコマンドを実行する
# 片付けは scripts/worktree-db-stop.sh。

set -euo pipefail

if [ $# -eq 0 ]; then
  echo "使い方: $0 <コマンド...>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
# shellcheck source=scripts/worktree-slot-lib.sh
source "$ROOT/scripts/worktree-slot-lib.sh"

if [ "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)" = "$(git -C "$ROOT" rev-parse --path-format=absolute --git-dir)" ]; then
  # メインのチェックアウトは既定の設定（スロット1）のまま使う
  SLOT=1
else
  SLOT="$(claim_slot "$ROOT")"
  if ! grep -q "^project_id = \".*-slot${SLOT}\"$" "$ROOT/supabase/config.toml"; then
    # 別スロット用に書き換え済みの場合に備え、いったん元に戻してから書き換える
    git -C "$ROOT" update-index --no-skip-worktree supabase/config.toml
    git -C "$ROOT" checkout -- supabase/config.toml
    python3 "$ROOT/scripts/patch-supabase-slot.py" "$ROOT/supabase/config.toml" "$SLOT" >&2
  fi
  # このワークツリーだけのローカル変更を誤ってコミットしないようにする
  git -C "$ROOT" update-index --skip-worktree supabase/config.toml
fi
APP_PORT="$(app_port_for_slot "$SLOT")"

if ! (cd "$ROOT" && doppler configure get config --plain 2>/dev/null | grep -q .); then
  echo "==> doppler setup（.doppler.yaml の project/config を使う）" >&2
  # .doppler.yaml は doppler setup --no-interactive が自動で読む形式ではないため、値を取り出して渡す
  (cd "$ROOT" && doppler setup --no-interactive \
    --project "$(sed -n 's/^ *project: *//p' .doppler.yaml)" \
    --config "$(sed -n 's/^ *config: *//p' .doppler.yaml)") >&2
fi

if ! supabase status --workdir "$ROOT" >/dev/null 2>&1; then
  echo "==> スロット${SLOT}のSupabaseを起動します（CIと同じ最小構成）" >&2
  # 同じワークツリーで同時に起動された場合は、もう一方の起動完了を待って続行する
  supabase start --workdir "$ROOT" \
    -x storage,imgproxy,realtime,edge-runtime,functions,analytics,vector,inbucket,studio,meta >&2 ||
    supabase status --workdir "$ROOT" >/dev/null
fi

eval "$(supabase status --workdir "$ROOT" -o env 2>/dev/null | sed 's/^/export SB_/')"

exec doppler run --scope "$ROOT" -- env \
  WORKTREE_SLOT="$SLOT" \
  PORT="$APP_PORT" \
  NEXT_PUBLIC_APP_URL="http://localhost:${APP_PORT}" \
  NEXT_PUBLIC_SUPABASE_URL="$SB_API_URL" \
  NEXT_PUBLIC_SUPABASE_ANON_KEY="$SB_PUBLISHABLE_KEY" \
  SUPABASE_SERVICE_ROLE_KEY="$SB_SECRET_KEY" \
  "$@"
