#!/usr/bin/env bash
# Webhookの入口（ngrokの固定URL・stripe listen）の鍵。task dev 一式の最初に実行する（docs/dev-parallel-worktrees.md参照）。
#
# 使い方: bash scripts/dev-entry.sh <タスク名>   入口を確保する（この場所が確保済みならそのまま続ける）
#         bash scripts/dev-entry.sh --release    入口を返す（task dev:clean）
#
# Clerk の Webhook の送り先（ngrok の固定URL）と stripe listen は同時に1つしか持てないため、入口を使える
# task dev は同時に1か所（メインのチェックアウトか、どれか1つのワークツリー）だけにする。
# 確保 = <git-common-dir>/dev-entry ディレクトリの作成（DBのスロットの確保と同じく、mkdir で原子的に行う）。
# owner に確保した場所の絶対パス、branch にそのブランチ、pids に確保した task のPIDを1行ずつ記録する。
# pids のプロセスがすべて終了していれば（異常終了・持ち主のワークツリーの削除）、持ち主が消えた入口として回収する。
# 持ち主の場所が削除済みでも、プロセス（別ウィンドウの ngrok 等）が残っていれば回収せず、task dev:clean で止めさせる
# （固定URLを古い ngrok が持ったままになり、Webhook が誰も待っていないポートへ流れるため）。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"
ENTRY_DIR="$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)/dev-entry"
# 持ち主のプロセス。既定は呼び出し元の task（task dev の間、Next.js 等の終了を待って動き続ける）
OWNER_PID="${DEV_ENTRY_PID:-$PPID}"

entry_owner() {
  cat "$ENTRY_DIR/owner" 2>/dev/null || true
}

# 持ち主のプロセスが1つでも動いていれば成功する
entry_alive() {
  local pid
  [ -f "$ENTRY_DIR/pids" ] || return 1
  while read -r pid; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
  done <"$ENTRY_DIR/pids"
  return 1
}

# 持ち主の場所が記録されていて、その場所が削除済みなら成功する
owner_removed() {
  local owner
  owner="$(entry_owner)"
  [ -n "$owner" ] && [ ! -d "$owner" ]
}

record_owner() {
  echo "$ROOT" >"$ENTRY_DIR/owner"
  git -C "$ROOT" branch --show-current >"$ENTRY_DIR/branch" 2>/dev/null || true
  echo "$OWNER_PID" >"$ENTRY_DIR/pids"
}

print_busy() {
  local action="$1" owner branch issue
  owner="$(entry_owner)"
  branch="$(cat "$ENTRY_DIR/branch" 2>/dev/null || true)"
  # ブランチ名は feature/<issue番号>-<内容>（Orcaが付けた <名前>/<issue番号>-<内容> も同じ形）
  issue="$(printf '%s\n' "$branch" | sed -nE 's#^[^/]+/([0-9]+)-.*#\1#p')"
  cat >&2 <<MSG
Webhookの入口（ngrok・stripe listen）は別の場所が使用中のため、${action}を中止しました。
  使用中の場所: ${owner}
  ブランチ: ${branch:-（不明）}${issue:+（issue #${issue}）}
入口は同時に1か所でしか使えません。使用中の場所で \`task dev:clean\` を実行して入口を返してから、もう一度実行してください。
MSG
}

claim() {
  local task_name="$1" owner
  if mkdir "$ENTRY_DIR" 2>/dev/null; then
    record_owner
    return
  fi

  owner="$(entry_owner)"
  if [ "$owner" = "$ROOT" ]; then
    echo "$OWNER_PID" >>"$ENTRY_DIR/pids"
    return
  fi

  # 削除済みの場所に残ったプロセスは、どこからでも task dev:clean で止めて入口を返せるようにする
  if owner_removed && [ "$task_name" = "dev:clean" ]; then
    return
  fi

  # owner が空 = 別の場所が確保した直後で、まだ記録を書いていない（DBのスロットの確保と同じく使用中として扱う）
  if [ -z "$owner" ]; then
    print_busy "\`task ${task_name}\`"
    exit 1
  fi

  if entry_alive; then
    if owner_removed; then
      cat >&2 <<MSG
Webhookの入口（ngrok・stripe listen）の持ち主の場所（${owner}）は削除済みですが、そこで起動したプロセス（別ウィンドウの ngrok 等）が残っているため、\`task ${task_name}\` を中止しました。
ここで \`task dev:clean\` を実行して残ったプロセスを止め、入口を返してから、もう一度実行してください。
MSG
    else
      print_busy "\`task ${task_name}\`"
    fi
    exit 1
  fi

  echo "==> 持ち主が消えた入口（${owner:-不明}）を回収します" >&2
  rm -rf "${ENTRY_DIR:?}"
  if ! mkdir "$ENTRY_DIR" 2>/dev/null; then
    # 回収の直後に別の場所が先に確保した
    print_busy "\`task ${task_name}\`"
    exit 1
  fi
  record_owner
}

release() {
  [ -d "$ENTRY_DIR" ] || return 0
  if [ "$(entry_owner)" != "$ROOT" ] && ! owner_removed && entry_alive; then
    print_busy "入口の返却"
    exit 1
  fi
  rm -rf "${ENTRY_DIR:?}"
  echo "Webhookの入口（ngrok・stripe listen）を返しました"
}

case "${1:-}" in
  --release) release ;;
  "")
    echo "使い方: $0 <タスク名> | --release" >&2
    exit 1
    ;;
  *) claim "$1" ;;
esac
