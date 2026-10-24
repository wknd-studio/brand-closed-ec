#!/usr/bin/env bash
# アプリが使うコンテナ（db・Auth・REST・kong）だけでローカルSupabaseを起動する（ワークツリーとCIで共通）。
#
# 使い方: bash scripts/supabase-start-minimal.sh [--keep <名前>] [supabase start に渡す追加の引数...]
#   例: bash scripts/supabase-start-minimal.sh --workdir "$ROOT"
#       bash scripts/supabase-start-minimal.sh --keep postgres-meta
#   --keep: 除外一覧のうち、このときだけ起動するコンテナ（複数回指定できる）
#
# 除外するコンテナは scripts/supabase-excluded-services.txt に定義する。
# CLI は --exclude に知らない名前を渡してもエラーにせず無視するため、起動前に
# `supabase start --help` の一覧と照合し、一致しない名前があれば起動せずに失敗する。

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

EXCLUDED="$(sed -e 's/#.*//' -e 's/[[:space:]]//g' -e '/^$/d' "$ROOT/scripts/supabase-excluded-services.txt")"

KEEP=()
while [ $# -gt 0 ] && [ "$1" = "--keep" ]; do
  if ! printf '%s\n' "$EXCLUDED" | grep -qxF -- "${2:-}"; then
    echo "--keep に、scripts/supabase-excluded-services.txt に無い名前が渡されました: ${2:-}" >&2
    exit 1
  fi
  KEEP+=("$2")
  shift 2
done

# 例: "  -x, --exclude string   Names of containers to not start. [gotrue,realtime,...]"
HELP="$(supabase start --help 2>/dev/null || true)"
EXCLUDABLE="$(printf '%s\n' "$HELP" | sed -n 's/.*--exclude.*\[\(.*\)\].*/\1/p' | tr ',' '\n')"
if [ -z "$EXCLUDABLE" ]; then
  echo "supabase start --help から --exclude で指定できる名前の一覧を取り出せませんでした" >&2
  exit 1
fi

UNKNOWN="$(grep -vxF -f <(printf '%s\n' "$EXCLUDABLE") <(printf '%s\n' "$EXCLUDED") || true)"
if [ -n "$UNKNOWN" ]; then
  echo "scripts/supabase-excluded-services.txt に、このSupabase CLI（$(supabase --version 2>/dev/null || echo '不明')）が --exclude で受け付けない名前があります:" >&2
  printf '  %s\n' $UNKNOWN >&2
  echo "受け付ける名前: $(printf '%s\n' "$EXCLUDABLE" | paste -sd, -)" >&2
  exit 1
fi

if [ ${#KEEP[@]} -gt 0 ]; then
  EXCLUDED="$(grep -vxF -f <(printf '%s\n' "${KEEP[@]}") <(printf '%s\n' "$EXCLUDED") || true)"
fi

exec supabase start -x "$(printf '%s\n' "$EXCLUDED" | paste -sd, -)" "$@"
