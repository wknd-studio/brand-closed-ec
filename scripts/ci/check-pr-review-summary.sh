#!/usr/bin/env bash
# PR本文の「レビューの要点」の3項目が埋まっているかを検査し、空なら失敗させる（#471）。
# 根拠を示す節は <details> に折りたたむため、人間が最初に読むこの節だけは必ず書かせる。
# あわせて「動作確認の手順」（#711）を検査する。人間がPRを開けば、どのアカウントで何を確かめるかを
# 各ワークツリーのClaudeに聞かずに分かるようにするため。
#
# 判定:
#   - 「## レビューの要点」の節（次の「## 」見出しまで）に、3項目の行（`- **項目名**:`）がある
#   - 各項目は、HTMLコメント（テンプレートの説明）と空白を除いて何か書いてある。「なし」は記入済み
#   - 項目の内容は、同じ行のラベルの後ろと、次の項目・見出しまでの続きの行を合わせて見る
#   - 「## 動作確認の手順」の節に4項目の行がある。手動確認は `要（マージ前）`・`要（stg）`・`不要` のどれかで、
#     `不要` なら後ろに理由を書く。`要（…）` なら準備・アカウント・手順と期待する結果の3項目が空欄でない
#
# Dependabot が作ったPR（作成者が dependabot[bot]）は、issue 無しの例外で本文を決まりに合わせられないため、
# 検査せずに成功扱いにする（#668。運用は CLAUDE.md の「Dependabot のセキュリティ更新」）
#
# 使い方: PR_BODY="<PR本文>" PR_AUTHOR="<PRの作成者>" bash scripts/ci/check-pr-review-summary.sh
#   （.github/workflows/pr-review-summary.yml から呼ぶ）
# needs-manual-check ラベルの付け外しは、sourceして manual_check_label_action を呼ぶ（同ワークフローのラベルのジョブ）
set -euo pipefail

SUMMARY_HEADING="レビューの要点"
SUMMARY_ITEMS=("変わる振る舞い" "一番危ない箇所" "人間に判断してほしいこと")
MANUAL_HEADING="動作確認の手順"
MANUAL_ITEMS=("手動確認" "準備" "アカウント" "手順と期待する結果")
DEPENDABOT_AUTHOR="dependabot[bot]"

# 標準入力: PR本文
# CRLFを揃え、複数行にまたがるものを含めてHTMLコメントを除く
normalize_body() {
  tr -d '\r' | perl -0pe 's/<!--.*?-->//gs'
}

# 標準入力: normalize_body を通した本文 / 引数: 見出し, 項目名...
# 節が無ければ「nosection」を、あれば項目ごとに「番号<TAB>行の有無(0/1)<TAB>内容」を出力する
# （内容は、ラベルの後ろと続きの行を空白でつないだもの）
extract_items() {
  local heading="$1"
  shift
  awk \
    -v heading="$heading" \
    -v items="$(IFS="|"; echo "$*")" '
    function trim(s) { gsub(/^[ \t]+|[ \t]+$/, "", s); return s }
    function append(i, s) {
      s = trim(s)
      if (s == "") return
      value[i] = (value[i] == "" ? s : value[i] " " s)
    }
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
        if (current) append(current, rest)
        next
      }
      if (current) append(current, line)
    }
    END {
      if (!found_section) { print "nosection"; exit }
      for (i = 1; i <= n; i++) printf "%d\t%d\t%s\n", i, seen[i] ? 1 : 0, value[i]
    }
  '
}

# 引数: 手動確認の欄の内容
# pre-merge / stg / none（理由あり） / none-noreason / invalid / empty のどれかを出力する
classify_manual_check() {
  local value
  # バッククォートで囲んだ書き方・半角の括弧も許す
  value="$(printf '%s' "$1" | perl -pe 's/`//g; s/\(/（/g; s/\)/）/g; s/^\s+|\s+$//g')"
  if [[ -z "$value" ]]; then
    echo "empty"
  elif [[ "$value" == "要（マージ前）"* ]]; then
    echo "pre-merge"
  elif [[ "$value" == "要（stg）"* ]]; then
    echo "stg"
  elif [[ "$value" == "不要"* ]]; then
    local reason
    reason="$(printf '%s' "${value#不要}" | perl -pe 's/(?:\s|:|：|、|。|,|\.|（|）|「|」|—|–|-)+//g')"
    if [[ -n "$reason" ]]; then echo "none"; else echo "none-noreason"; fi
  else
    echo "invalid"
  fi
}

# 標準入力: normalize_body を通した本文
# 手動確認の欄を classify_manual_check で分類して出力する（節・行が無ければ empty）
manual_check_kind() {
  local line
  line="$(extract_items "$MANUAL_HEADING" "${MANUAL_ITEMS[@]}" | awk -F '\t' '$1 == 1')"
  classify_manual_check "$(printf '%s' "$line" | cut -f3-)"
}

# 標準入力: normalize_body を通した本文
# 「レビューの要点」の空欄を出力する
summary_findings() {
  local extracted idx seen value label
  extracted="$(extract_items "$SUMMARY_HEADING" "${SUMMARY_ITEMS[@]}")"
  if [[ "$extracted" == "nosection" ]]; then
    printf '::error::PR本文に「## %s」の節がありません。.github/pull_request_template.md の節を貼り、3項目を書いてください\n' "$SUMMARY_HEADING"
    return
  fi
  while IFS=$'\t' read -r idx seen value; do
    label="${SUMMARY_ITEMS[$((idx - 1))]}"
    if [[ "$seen" != 1 ]]; then
      printf '::error::「%s」に「- **%s**:」の行がありません\n' "$SUMMARY_HEADING" "$label"
    elif [[ -z "$value" ]]; then
      printf '::error::「%s」の %s が空欄です（該当しなければ「なし」と書く）\n' "$SUMMARY_HEADING" "$label"
    fi
  done <<<"$extracted"
}

# 標準入力: normalize_body を通した本文
# 「動作確認の手順」の空欄・不正な値を出力する
manual_check_findings() {
  local extracted idx seen value label kind=""
  extracted="$(extract_items "$MANUAL_HEADING" "${MANUAL_ITEMS[@]}")"
  if [[ "$extracted" == "nosection" ]]; then
    printf '::error::PR本文に「## %s」の節がありません。.github/pull_request_template.md の節を貼り、4項目を書いてください\n' "$MANUAL_HEADING"
    return
  fi
  while IFS=$'\t' read -r idx seen value; do
    label="${MANUAL_ITEMS[$((idx - 1))]}"
    if [[ "$seen" != 1 ]]; then
      printf '::error::「%s」に「- **%s**:」の行がありません\n' "$MANUAL_HEADING" "$label"
      continue
    fi
    if [[ "$idx" == 1 ]]; then
      kind="$(classify_manual_check "$value")"
      case "$kind" in
        empty) printf '::error::「%s」の %s が空欄です（`要（マージ前）`・`要（stg）`・`不要` のどれかを書く）\n' "$MANUAL_HEADING" "$label" ;;
        invalid) printf '::error::「%s」の %s は `要（マージ前）`・`要（stg）`・`不要` のどれかで書いてください（今の値: %s）\n' "$MANUAL_HEADING" "$label" "$value" ;;
        none-noreason) printf '::error::「%s」の %s が `不要` のときは、理由を1行書いてください（例: 不要（CIの設定だけ））\n' "$MANUAL_HEADING" "$label" ;;
      esac
      continue
    fi
    # 準備・アカウント・手順は、手動確認が要のときだけ必須
    if [[ ("$kind" == "pre-merge" || "$kind" == "stg") && -z "$value" ]]; then
      printf '::error::「%s」の %s が空欄です（手動確認が要のときは必須）\n' "$MANUAL_HEADING" "$label"
    fi
  done <<<"$extracted"
}

# 標準入力: PR本文
# 空欄の項目を出力し、1つでもあれば1を返す
judge_pr_review_summary() {
  local body findings
  body="$(normalize_body)"
  findings="$(
    printf '%s\n' "$body" | summary_findings
    printf '%s\n' "$body" | manual_check_findings
  )"

  if [[ -z "$findings" ]]; then
    echo "OK: 「${SUMMARY_HEADING}」の3項目と「${MANUAL_HEADING}」が書かれています"
    return 0
  fi

  echo "$findings"
  cat <<MSG

PR本文の冒頭にある「${SUMMARY_HEADING}」「${MANUAL_HEADING}」を埋めてください（書き方は CLAUDE.md「自動push・PR」）。
本文を編集すると、このチェックは自動で再実行されます。
MSG
  return 1
}

# 環境変数: EVENT_ACTION（pull_request の action）・PR_BODY・PR_PREVIOUS_BODY（本文が変わった edited のときの編集前の本文）
# needs-manual-check ラベルを add / remove / none のどれにするかを出力する。
# 手動確認が要なら付け、不要なら外す。edited は要・不要が変わったときだけ動かす
# （人間が確かめ終わって外したラベルを、本文の別の箇所の編集で付け直さないため）
manual_check_label_action() {
  local kind previous
  kind="$(printf '%s' "${PR_BODY:-}" | normalize_body | manual_check_kind)"
  case "$kind" in
    pre-merge | stg) kind="need" ;;
    none) kind="none" ;;
    *) echo "none"; return 0 ;;
  esac
  if [[ "${EVENT_ACTION:-}" == "edited" ]]; then
    previous="$(printf '%s' "${PR_PREVIOUS_BODY:-}" | normalize_body | manual_check_kind)"
    case "$previous" in
      pre-merge | stg) previous="need" ;;
    esac
    if [[ "$previous" == "$kind" ]]; then
      echo "none"
      return 0
    fi
  fi
  if [[ "$kind" == "need" ]]; then echo "add"; else echo "remove"; fi
}

main() {
  if [[ "${PR_AUTHOR:-}" == "$DEPENDABOT_AUTHOR" ]]; then
    echo "OK: Dependabot が作ったPRのため、本文の「${SUMMARY_HEADING}」「${MANUAL_HEADING}」は検査しません（high-risk として人間が差分を精読する）"
    return 0
  fi
  printf '%s' "${PR_BODY:-}" | judge_pr_review_summary
}

# sourceされたとき（ユニットテスト）はmainを実行しない
if ! (return 0 2>/dev/null); then
  main "$@"
fi
