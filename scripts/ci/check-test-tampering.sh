#!/usr/bin/env bash
# PRの差分から、テストを弱めて通そうとする変更を検出して失敗させる（#309）。
# AIエージェントが実装を直す代わりにテストを削除・skip・アサーション削減して
# CIを通すのを、人間が全差分を読まなくても止められるようにする。
#
# 検出するもの:
#   - テストファイル（tests/**、*.test.*、*.spec.*）の削除（テスト以外のパスへのリネームを含む）
#   - .skip( / .only( / .todo( / .fixme( / .skipIf( / xit( 等の追加
#   - 変更したテストファイルでの expect( の数の減少
#   - テスト対象を変える設定（vitest*.config.*・playwright.config.* の exclude / testIgnore 等）の変更
#
# 意図的な変更なら、人間がPRに `test-change-approved` ラベルを付けると成功扱いになる
# （.github/workflows/test-guard.yml）。
#
# 使い方: bash scripts/ci/check-test-tampering.sh <base-ref> [<head-ref>]
#   例: bash scripts/ci/check-test-tampering.sh origin/develop HEAD
set -euo pipefail

APPROVAL_LABEL="test-change-approved"

# 標準入力: `git diff -M --unified=0` の出力
# 検出した箇所を出力し、1件でもあれば1を返す
judge_test_tampering() {
  local findings
  findings="$(awk '
    function is_test(p) { return p ~ /^tests\// || p ~ /\.(test|spec)\.[cm]?[jt]sx?$/ }
    function is_config(p,  base) {
      base = p; sub(/.*\//, "", base)
      return base ~ /^(vitest[^\/]*\.config|playwright\.config)\.[cm]?[jt]s$/
    }
    # 直前の文字が識別子の一部でない（obj.fit( や myexpect( を除く）位置での出現数
    function count_word(s, re,  n, pre) {
      n = 0
      while (match(s, re)) {
        pre = RSTART > 1 ? substr(s, RSTART - 1, 1) : ""
        if (pre !~ /[A-Za-z0-9_$.]/) n++
        s = substr(s, RSTART + RLENGTH)
      }
      return n
    }
    function is_skip(s) {
      return s ~ /\.(skip|only|todo|fixme|skipIf|runIf)[(.]/ ||
        count_word(s, "(xit|xtest|xdescribe|fit|fdescribe)\\(") > 0
    }
    function is_config_key(s) {
      return s ~ /(exclude|include|testIgnore|testMatch|testDir|grep|grepInvert|passWithNoTests|forbidOnly)/
    }
    function trim(s) { sub(/^[ \t]+/, "", s); sub(/[ \t]+$/, "", s); return s }
    function report(file, line, msg) {
      if (line != "") printf "::error file=%s,line=%s::%s\n", file, line, msg
      else printf "::error file=%s::%s\n", file, msg
    }
    function flush_file() {
      if (path == "") return
      if (is_test(old_path) && (deleted || (renamed && !is_test(path)))) {
        report(old_path, "", "テストファイルの削除" (renamed ? "（" path " へのリネーム）" : ""))
      } else if (is_test(path) && removed_expect > added_expect) {
        report(path, "", sprintf("expect の数が %d 個減っています（削除 %d・追加 %d）", removed_expect - added_expect, removed_expect, added_expect))
      }
    }
    /^diff --git / {
      flush_file()
      # "diff --git a/<old> b/<new>"（パスに空白を含む場合はrename行・---/+++行で上書きする）
      old_path = $3; sub(/^a\//, "", old_path)
      path = $4; sub(/^b\//, "", path)
      deleted = 0; renamed = 0; in_hunk = 0
      added_expect = 0; removed_expect = 0
      next
    }
    !in_hunk && /^deleted file mode/ { deleted = 1; next }
    !in_hunk && /^rename from / { renamed = 1; old_path = substr($0, 13); next }
    !in_hunk && /^rename to / { path = substr($0, 11); next }
    !in_hunk && /^--- a\// { old_path = substr($0, 7); next }
    !in_hunk && /^\+\+\+ b\// { path = substr($0, 7); next }
    /^@@ / {
      in_hunk = 1
      split($2, o, ","); old_line = substr(o[1], 2) + 0
      split($3, n, ","); new_line = substr(n[1], 2) + 0
      next
    }
    in_hunk && /^\+/ {
      text = substr($0, 2)
      if (is_test(path)) {
        added_expect += count_word(text, "expect[.(]")
        if (is_skip(text)) report(path, new_line, "skip/only等の追加: " trim(text))
      }
      if (is_config(path) && is_config_key(text)) report(path, new_line, "テスト対象の設定変更: " trim(text))
      new_line++
      next
    }
    in_hunk && /^-/ {
      text = substr($0, 2)
      if (is_test(old_path)) removed_expect += count_word(text, "expect[.(]")
      if (is_config(old_path) && is_config_key(text)) report(old_path, old_line, "テスト対象の設定変更（削除行）: " trim(text))
      old_line++
      next
    }
    END { flush_file() }
  ')"

  if [[ -z "$findings" ]]; then
    echo "OK: テストの削除・skip・アサーション減少・テスト対象の設定変更は見つかりませんでした"
    return 0
  fi

  echo "$findings"
  cat <<MSG

テストを弱める変更を検出しました。実装を直してテストを通してください。
テストの削除・skip・アサーションの変更が意図的なもの（仕様変更で不要になった等）なら、
人間が内容を確認したうえでPRに \`${APPROVAL_LABEL}\` ラベルを付けると、このチェックは成功扱いになります。
MSG
  return 1
}

main() {
  local base_ref="${1:?ベースのref（例: origin/develop）を指定してください}"
  local head_ref="${2:-HEAD}"

  git diff -M --unified=0 --no-color --no-ext-diff --src-prefix=a/ --dst-prefix=b/ \
    "$base_ref...$head_ref" | judge_test_tampering
}

# sourceされたとき（ユニットテスト）はmainを実行しない
if ! (return 0 2>/dev/null); then
  main "$@"
fi
