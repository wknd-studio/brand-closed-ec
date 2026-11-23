#!/usr/bin/env bash
# task dev 一式のコマンドを、実行した場所のDB・ポートで動かす（docs/dev-parallel-worktrees.md参照）。
#
# 使い方: bash scripts/dev-run.sh <next|stripe|ngrok|supabase|supabase-stop|seed>
#
# - メインのチェックアウト: 今までどおりスロット1（既定のSupabase・Dopplerの値・ポート3000）で動かす
# - Orcaのワークツリー: そのワークツリーのスロット（with-worktree-db.sh）のDB・ポート（3001〜）で動かし、
#   ngrok の固定URLと stripe listen の転送先もそのポートにする
# 入口（ngrok・stripe listen）を使えるのは同時に1か所だけ。確保は Taskfile.yml の各タスクの最初の dev-entry.sh が行う。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
# shellcheck source=scripts/worktree-slot-lib.sh
source "$ROOT/scripts/worktree-slot-lib.sh"

if [ "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)" = "$(git -C "$ROOT" rev-parse --path-format=absolute --git-dir)" ]; then
  IS_WORKTREE=false
  APP_PORT="$(app_port_for_slot 1)"
else
  IS_WORKTREE=true
  # with-worktree-db.sh と同じスロット（確保済みならそれを使う）
  APP_PORT="$(app_port_for_slot "$(claim_slot "$ROOT")")"
fi

cd "$ROOT"

case "${1:-}" in
  next)
    # ポートを明示すると、使用中でも次の空きポート（別のスロットのポート）へ移らずエラーで止まる
    if $IS_WORKTREE; then
      exec bash "$ROOT/scripts/with-worktree-db.sh" pnpm next dev --turbo --port "$APP_PORT"
    fi
    exec doppler run -- pnpm next dev --turbo --port "$APP_PORT"
    ;;
  stripe)
    exec doppler run -- stripe listen --forward-to "localhost:${APP_PORT}/api/webhooks/stripe"
    ;;
  ngrok)
    # ngrok.yml の addr（3000）をこの場所のポートに変えた設定を一時ファイルに作って渡す
    # （ngrok.yml はコミットされているファイルのため書き換えない）
    config="$(mktemp "${TMPDIR:-/tmp}/ngrok-dev-entry.XXXXXX")"
    trap 'rm -f "$config"' EXIT
    sed -E "s/^([[:space:]]*addr:).*/\1 ${APP_PORT}/" "$ROOT/ngrok.yml" >"$config"
    ngrok start default --config "$HOME/Library/Application Support/ngrok/ngrok.yml" --config "$config"
    ;;
  supabase)
    if $IS_WORKTREE; then
      exec bash "$ROOT/scripts/with-worktree-db.sh" true
    fi
    exec supabase start
    ;;
  supabase-stop)
    if $IS_WORKTREE; then
      # ワークツリーのSupabaseはテストでも使うため止めない。片付けは worktree-db-stop.sh
      echo "ワークツリーのSupabaseは止めません（片付けは bash scripts/worktree-db-stop.sh）" >&2
      exit 0
    fi
    exec supabase stop
    ;;
  seed)
    # メインのチェックアウトは今までどおり、必要なら task seed を手で実行する
    if $IS_WORKTREE; then
      exec bash "$ROOT/scripts/with-worktree-db.sh" pnpm -s tsx scripts/seed-if-missing.ts
    fi
    ;;
  *)
    echo "使い方: $0 <next|stripe|ngrok|supabase|supabase-stop|seed>" >&2
    exit 1
    ;;
esac
