#!/usr/bin/env bash
# ローカルDB（全マイグレーションを当てた状態）の今の定義を、supabase/schemas/ に
# 1オブジェクト1ファイルで書き出す（宣言的スキーマの段階A。#783）。
# 正はマイグレーションのまま。supabase/schemas/ は自動で書き出した写しで、直接編集しない。
#
# 使い方: bash scripts/db-schema-snapshot.sh          # 書き出して supabase/schemas/ を置き換える
#         bash scripts/db-schema-snapshot.sh --check  # 書き出し直して、コミット済みと違えば失敗する（CIの Schema Files Drift）
#   ローカルでは `task db:schema`（ワークツリーではそのスロットのDBを使う）。先に `supabase db reset` しておく
set -euo pipefail

SCHEMAS_DIR="supabase/schemas"
# 手で書いた説明。書き出しの対象外で、置き換え・比較のどちらでも触らない
KEEP_FILE="README.md"

# 引数: $1 = 書き出し先（無ければ作る。中身は消してから書き出す）
generate_schema() {
  local out="$1"
  rm -rf "$out"
  mkdir -p "$out"
  # 宣言的スキーマのコマンドは CLI v2.116.0 では experimental 扱い。
  # --no-cache: 前回の書き出しのカタログを使い回さず、毎回DBから読み直す
  supabase db schema declarative generate --experimental --no-cache --local \
    --output-dir "$out" --overwrite >&2
}

# 引数: $1 = ディレクトリ。README.md を除いたファイルの相対パスを並べて出す
list_schema_files() {
  (cd "$1" && find . -type f ! -path "./$KEEP_FILE" | sed 's|^\./||' | LC_ALL=C sort)
}

# 引数: $1 = 書き出した内容、$2 = 置き換える先（supabase/schemas/）
replace_schema_dir() {
  local generated="$1" dest="$2"
  mkdir -p "$dest"
  find "$dest" -mindepth 1 -maxdepth 1 ! -name "$KEEP_FILE" -exec rm -rf {} +
  cp -R "$generated/." "$dest/"
}

# 引数: $1 = 書き出した内容、$2 = コミット済みの内容
# 違うファイルがあれば一覧と直し方を出力して1を返す
diff_schema_dirs() {
  local generated="$1" committed="$2" file
  local -a drifted=()

  while IFS= read -r file; do
    [[ -z "$file" ]] && continue
    if ! cmp -s "$generated/$file" "$committed/$file"; then
      drifted+=("$file")
    fi
  done < <(cat <(list_schema_files "$generated") <(list_schema_files "$committed") | LC_ALL=C sort -u)

  if [[ ${#drifted[@]} -eq 0 ]]; then
    echo "OK: ${committed} はDBの今の定義と一致しています"
    return 0
  fi

  echo "::error::${committed} がDBの今の定義（マイグレーションを当てた状態）と一致していません"
  local f
  for f in "${drifted[@]}"; do
    if [[ ! -e "$committed/$f" ]]; then
      echo "  - $f（コミットされていない）"
    elif [[ ! -e "$generated/$f" ]]; then
      echo "  - $f（DBには無い）"
    else
      echo "  - $f"
    fi
  done
  for f in "${drifted[@]}"; do
    [[ -e "$committed/$f" && -e "$generated/$f" ]] && diff -u "$committed/$f" "$generated/$f" || true
  done
  cat <<MSG

マイグレーションを足した・変えたあとは、\`supabase db reset\` してから \`task db:schema\` を実行し、
${committed}/ をコミットしてください（ワークツリーでは \`bash scripts/with-worktree-db.sh supabase db reset\`）。
MSG
  return 1
}

main() {
  # EXIT の trap は main を抜けた後に動くため、local にしない
  TMP_DIR="$(mktemp -d)"
  trap 'rm -rf "$TMP_DIR"' EXIT

  generate_schema "$TMP_DIR/schemas"
  if [[ "${1:-}" == "--check" ]]; then
    diff_schema_dirs "$TMP_DIR/schemas" "$SCHEMAS_DIR"
  else
    replace_schema_dir "$TMP_DIR/schemas" "$SCHEMAS_DIR"
    echo "${SCHEMAS_DIR}/ に書き出しました"
  fi
}

# sourceされたとき（テスト）はmainを実行しない
if ! (return 0 2>/dev/null); then
  main "$@"
fi
