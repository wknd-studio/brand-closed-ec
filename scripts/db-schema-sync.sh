#!/usr/bin/env bash
# supabase/schemas/（スキーマのファイル。正）と、supabase/migrations/ を全部当てた状態との差を、
# マイグレーションとして書き出す（宣言的スキーマの段階B。#784。手順は docs/declarative-schema.md）。
#
# 使い方: bash scripts/db-schema-sync.sh <名前>  # 差をマイグレーションにする（ローカルのDBには当てない）
#         bash scripts/db-schema-sync.sh --check   # 差が無いことを確かめる（CIの Schema Files Drift）
#   ローカルでは `task db:sync -- <名前>`（ワークツリーではそのスロットのDBを使う）
#
# sync はシャドーDBにマイグレーションとスキーマのファイルをそれぞれ当てて比べるため、ローカルのDBの状態は使わない。
# 版によって作るマイグレーションが変わるため、ローカルの Supabase CLI はCIと同じ版でなければ止める
set -euo pipefail

MIGRATIONS_DIR="supabase/migrations"
CHECK_NAME="schema_sync_check"

# 引数: ワークフローのファイル。install-cli に渡している Supabase CLI の版が1つならそれを出す。0個・複数なら失敗
ci_supabase_version() {
  local versions
  versions="$(cat "$@" | grep -oE 'tool: supabase, version: [0-9]+\.[0-9]+\.[0-9]+' |
    sed 's/.*version: //' | LC_ALL=C sort -u || true)"
  if [[ -z "$versions" ]]; then
    echo "::error::ワークフローに Supabase CLI の版（with: { tool: supabase, version: x.y.z }）が見つかりません" >&2
    return 1
  fi
  if [[ "$(wc -l <<<"$versions")" -gt 1 ]]; then
    echo "::error::ワークフローの Supabase CLI の版が1つにそろっていません:" >&2
    sed 's/^/  - /' <<<"$versions" >&2
    return 1
  fi
  echo "$versions"
}

# 引数: $1 = ローカルの版、$2 = CIの版
check_cli_version() {
  local local_version="$1" ci_version="$2"
  [[ "$local_version" == "$ci_version" ]] && return 0
  cat >&2 <<MSG
::error::ローカルの Supabase CLI（${local_version}）が、CIの版（${ci_version}）と違います。
版によって sync が作るマイグレーションが変わるため、CIと同じ版にしてください。
Homebrew の supabase は最新版しか入らないため、https://github.com/supabase/cli/releases/tag/v${ci_version}
のバイナリを PATH の先に置く（brew で入れた版は brew unlink supabase で外せる）。
CIの版を上げるなら、.github/workflows/ の install-cli の版をすべて同じ版にそろえる。
MSG
  return 1
}

# 引数: $1 = --check で sync が作ったマイグレーション（作らなければ空）
judge_sync_check() {
  local created="$1"
  if [[ -z "$created" ]]; then
    echo "OK: スキーマのファイルとマイグレーションの結果に差はありません"
    return 0
  fi
  echo "::error::スキーマのファイル（supabase/schemas/）と、マイグレーションを当てた結果に差があります。sync は次のマイグレーションを作りました:"
  local file
  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    echo "--- ${file}"
    cat "$file"
  done <<<"$created"
  cat <<'MSG'

- スキーマのファイルを直したなら、`task db:sync -- <名前>` でマイグレーションを作ってコミットしてください。
- sync が作ったマイグレーションから、書いていない GRANT・REVOKE を消したなら、スキーマのファイルの権限が
  意図と違います。スキーマのファイルに GRANT・REVOKE を書いてください。
- マイグレーションを手で書いたなら、`supabase db reset` してから `task db:schema` を実行し、
  supabase/schemas/ をコミットしてください。
（手順は docs/declarative-schema.md）
MSG
  return 1
}

# sync を実行し、作ったマイグレーションのパスを1行ずつ出す（作らなければ何も出さない）。sync が失敗したら失敗する。
# コマンド置換の中では set -e が効かないため、各コマンドの失敗を明示的に返す
# 引数: $1 = マイグレーションの名前
run_sync() {
  local name="$1" before after
  before="$(ls "$MIGRATIONS_DIR")" || return 1
  supabase db schema declarative sync --experimental --no-cache --no-apply --name "$name" >&2 || {
    echo "::error::supabase db schema declarative sync が失敗しました" >&2
    return 1
  }
  after="$(ls "$MIGRATIONS_DIR")" || return 1
  comm -13 <(echo "$before") <(echo "$after") | sed "s|^|$MIGRATIONS_DIR/|"
}

# 引数: $1 = 消すマイグレーションのパス（改行区切り）
remove_created() {
  local file
  while IFS= read -r file; do
    [[ -n "$file" ]] && rm -f "$file"
  done <<<"$1"
  return 0
}

main() {
  local arg="${1:?マイグレーションの名前（例: add_note_to_orders）か --check を指定してください}"
  local ci_version local_version
  ci_version="$(ci_supabase_version .github/workflows/*.yml)"
  local_version="$(supabase --version 2>/dev/null | head -n1)"
  check_cli_version "$local_version" "$ci_version"

  if [[ "$arg" == "--check" ]]; then
    local created
    created="$(run_sync "$CHECK_NAME")" || return 1
    if ! judge_sync_check "$created"; then
      remove_created "$created"
      return 1
    fi
    return 0
  fi

  local created
  created="$(run_sync "$arg")" || return 1
  if [[ -z "$created" ]]; then
    echo "スキーマのファイルとマイグレーションの結果に差が無いため、マイグレーションは作りませんでした"
    return 0
  fi
  cat <<MSG
次のマイグレーションを作りました:
${created}
コミットする前に:
  1. 中身を読み、DROP（名前の変更が消して作り直すになっていないか）と、書いていない GRANT・REVOKE が無いか確かめる
  2. supabase db reset（ワークツリーでは bash scripts/with-worktree-db.sh supabase db reset）で当てる
  3. task db:schema を実行し、supabase/schemas/ に差分が残らないことを確かめる
  4. supabase gen types typescript --local > src/types/database.types.ts
（手順は docs/declarative-schema.md）
MSG
}

# sourceされたとき（テスト）はmainを実行しない
if ! (return 0 2>/dev/null); then
  main "$@"
fi
