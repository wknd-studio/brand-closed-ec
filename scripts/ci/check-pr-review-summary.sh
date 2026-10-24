#!/usr/bin/env bash
# PR本文の「レビューの要点」の3項目が埋まっているかを検査し、空なら失敗させる（#471）。
# 根拠を示す節は <details> に折りたたむため、人間が最初に読むこの節だけは必ず書かせる。
#
# 判定:
#   - 「## レビューの要点」の節（次の「## 」見出しまで）に、3項目の行（`- **項目名**:`）がある
#   - 各項目は、HTMLコメント（テンプレートの説明）と空白を除いて何か書いてある。「なし」は記入済み
#   - 項目の内容は、同じ行のラベルの後ろと、次の項目・見出しまでの続きの行を合わせて見る
#
# 使い方: PR_BODY="<PR本文>" bash scripts/ci/check-pr-review-summary.sh
#   （.github/workflows/pr-review-summary.yml から呼ぶ）
set -euo pipefail

SUMMARY_HEADING="レビューの要点"
SUMMARY_ITEMS=("変わる振る舞い" "一番危ない箇所" "人間に判断してほしいこと")

# 標準入力: PR本文
# 空欄の項目を出力し、1つでもあれば1を返す
judge_pr_review_summary() {
  local findings
  # CRLFを揃え、複数行にまたがるものを含めてHTMLコメントを除いてから見る
  findings="$(tr -d '\r' | perl -0pe 's/<!--.*?-->//gs' | awk \
    -v heading="$SUMMARY_HEADING" \
    -v items="$(IFS="|"; echo "${SUMMARY_ITEMS[*]}")" '
    function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    BEGIN {
      n = split(items, labels, "|")
      in_section = 0; found_section = 0; current = 0
    }
    /^## / {
      in_section = (trim(substr($0, 4)) == heading)
      if (in_section) found_section = 1
      current = 0
      next
    }
    !in_section { next }
    {
      line = $0
      # 「- **項目名**:」（全角コロン・コロンが太字の内側にある書き方も許す。全角は複数バイトのため [] でなく | で書く）
      if (match(line, /^[ \t]*[-*][ \t]+\*\*[^*]+\*\*/)) {
        label = substr(line, RSTART, RLENGTH)
        sub(/^[ \t]*[-*][ \t]+\*\*/, "", label); sub(/\*\*$/, "", label)
        sub(/(:|：)$/, "", label)
        rest = substr(line, RSTART + RLENGTH)
        sub(/^(:|：)/, "", rest)
        current = 0
        for (i = 1; i <= n; i++) {
          if (labels[i] == trim(label)) { current = i; seen[i] = 1 }
        }
        if (current && trim(rest) != "") filled[current] = 1
        next
      }
      if (current && trim(line) != "") filled[current] = 1
    }
    END {
      if (!found_section) {
        printf "::error::PR本文に「## %s」の節がありません。.github/pull_request_template.md の節を貼り、3項目を書いてください\n", heading
        exit
      }
      for (i = 1; i <= n; i++) {
        if (!seen[i]) printf "::error::「%s」に「- **%s**:」の行がありません\n", heading, labels[i]
        else if (!filled[i]) printf "::error::「%s」の %s が空欄です（該当しなければ「なし」と書く）\n", heading, labels[i]
      }
    }
  ')"

  if [[ -z "$findings" ]]; then
    echo "OK: 「${SUMMARY_HEADING}」の3項目が書かれています"
    return 0
  fi

  echo "$findings"
  cat <<MSG

PR本文の冒頭にある「${SUMMARY_HEADING}」を埋めてください（書き方は CLAUDE.md「自動push・PR」）。
本文を編集すると、このチェックは自動で再実行されます。
MSG
  return 1
}

main() {
  printf '%s' "${PR_BODY:-}" | judge_pr_review_summary
}

# sourceされたとき（ユニットテスト）はmainを実行しない
if ! (return 0 2>/dev/null); then
  main "$@"
fi
