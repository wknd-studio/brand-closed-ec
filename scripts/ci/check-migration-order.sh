#!/usr/bin/env bash
# PRで追加・リネームしたマイグレーションのタイムスタンプが、ベースブランチ（develop）に
# 既にある最新のマイグレーション以下なら失敗させる。
# stg・prodの `supabase db push --linked` は適用済みの最新より古いファイルを拒否するため、
# developマージ後のデプロイで初めて失敗するのをPRの段階で止める（#318）。
#
# 使い方: bash scripts/ci/check-migration-order.sh <base-ref> [<head-ref>]
#   例: bash scripts/ci/check-migration-order.sh origin/develop HEAD
set -euo pipefail

MIGRATIONS_DIR="supabase/migrations"

# 引数: $1 = ベースにあるマイグレーションのパス一覧（改行区切り）
#       $2 = PRで追加・リネームしたマイグレーションのパス一覧（改行区切り）
# 古いものがあれば対象と直し方を出力して1を返す
judge_migration_order() {
  local base_files="$1" added_files="$2"
  local latest="" file name ts
  local -a stale=()

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    ts="$(basename "$file" | grep -oE '^[0-9]+' || true)"
    [[ -n "$ts" && "$ts" > "$latest" ]] && latest="$ts"
  done <<<"$base_files"

  if [[ -z "$latest" ]]; then
    echo "ベースブランチにマイグレーションが無いため、順序のチェックをスキップします"
    return 0
  fi

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    name="$(basename "$file")"
    ts="$(grep -oE '^[0-9]+' <<<"$name" || true)"
    # タイムスタンプは14桁固定のため文字列比較で順序を判定できる
    if [[ -z "$ts" || ! "$ts" > "$latest" ]]; then
      stale+=("$file")
    fi
  done <<<"$added_files"

  if [[ ${#stale[@]} -eq 0 ]]; then
    echo "OK: 追加したマイグレーションはすべてベースブランチの最新（${latest}）より新しいタイムスタンプです"
    return 0
  fi

  echo "::error::ベースブランチの最新のマイグレーション（${latest}）以前のタイムスタンプのマイグレーションが追加されています"
  printf '  - %s\n' "${stale[@]}"
  cat <<MSG

このままマージすると、stg・prodの \`supabase db push\` が
"Found local migration files to be inserted before the last migration on remote database."
で失敗します。以下のどちらかで直してください:
  1. \`supabase migration new <name>\` でマイグレーションを作り直し、中身を移す
  2. ファイル名のタイムスタンプを ${latest} より新しい値にリネームする
直したら \`supabase gen types typescript --local > src/types/database.types.ts\` を再実行してコミットしてください
（ワークツリーでは \`bash scripts/with-worktree-db.sh\` 経由で \`supabase db reset\` してから実行する）。
MSG
  return 1
}

main() {
  local base_ref="${1:?ベースのref（例: origin/develop）を指定してください}"
  local head_ref="${2:-HEAD}"

  local base_files added_files
  base_files="$(git ls-tree --name-only "$base_ref" -- "$MIGRATIONS_DIR/" | grep -E '\.sql$' || true)"
  added_files="$(git diff --name-only --diff-filter=AR "$base_ref...$head_ref" -- "$MIGRATIONS_DIR/*.sql")"

  if [[ -z "$added_files" ]]; then
    echo "マイグレーションの追加・リネームが無いため、チェック不要です"
    return 0
  fi

  judge_migration_order "$base_files" "$added_files"
}

# sourceされたとき（ユニットテスト）はmainを実行しない
if ! (return 0 2>/dev/null); then
  main "$@"
fi
