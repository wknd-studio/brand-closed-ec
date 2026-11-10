#!/usr/bin/env bash
# Supabase CLI・Doppler CLI を、GitHub のリリースから API 経由で取得してインストールする（#546）。
# `github.com/<repo>/releases/download/<tag>/<file>` が一部のリリースで504を返し続け、
# それを通る `supabase/setup-cli`・`dopplerhq/cli-action` でCIが止まった。同じファイルを
# `api.github.com/repos/<repo>/releases/assets/<id>`（`gh release download` と同じ経路）から取り、
# 5xx・タイムアウトだけを間隔をあけてやり直す。4xx（403・404・429等）はやり直さずに失敗する。
# 取得したファイルは、リリースの checksums.txt の SHA-256 と照合してから展開する。
#
# Supabase CLI は v2.102.0 から、シムの supabase と本体の supabase-go の2つが同じディレクトリに
# 無いと動かない（#549）。tarball の LICENSE・completions 等は要らないため、丸ごとは展開しない。
#
# 使い方: bash install-cli.sh <supabase|doppler> <版>
#   例: bash install-cli.sh supabase 2.116.0
# 環境変数: GH_TOKEN（任意。あれば API の認証に使う）・INSTALL_CLI_DIR（展開先。既定は $RUNNER_TEMP 配下）
#           INSTALL_CLI_MAX_ATTEMPTS（既定4）・INSTALL_CLI_RETRY_DELAY（1回目の待ち秒数。既定10、回ごとに倍）
set -euo pipefail

API="https://api.github.com"

release_repo() {
  case "$1" in
    supabase) echo "supabase/cli" ;;
    doppler) echo "DopplerHQ/cli" ;;
    *)
      echo "::error::知らないCLIです: $1（supabase か doppler）" >&2
      return 1
      ;;
  esac
}

# Supabase のタグは v付き、Doppler は v無し
release_tag() {
  case "$1" in
    supabase) echo "v$2" ;;
    *) echo "$2" ;;
  esac
}

# 引数: <CLI> <版> <OS> <アーキテクチャ>
asset_name() {
  echo "$1_$2_$3_$4.tar.gz"
}

# 引数: <curlの終了コード> <HTTPステータス>。やり直すなら0を返す
is_retryable() {
  local curl_exit="$1" http_code="$2"
  [[ "$http_code" =~ ^4[0-9][0-9]$ ]] && return 1
  [[ "$http_code" =~ ^5[0-9][0-9]$ ]] && return 0
  # 接続できない・タイムアウト・受信中の切断（200を受け取ったあとを含む）
  [[ "$curl_exit" != "0" ]] && return 0
  return 1
}

# 引数: <URL> <保存先> <Acceptヘッダー>
fetch_with_retry() {
  local url="$1" out="$2" accept="$3"
  local max="${INSTALL_CLI_MAX_ATTEMPTS:-4}" delay="${INSTALL_CLI_RETRY_DELAY:-10}"
  local attempt http_code curl_exit
  local -a auth=()

  # releases/download/ を通らないよう、API の URL だけを受け付ける
  if [[ "$url" != "$API/"* ]]; then
    echo "::error::API 以外の URL からは取得しません: $url" >&2
    return 1
  fi
  [[ -n "${GH_TOKEN:-}" ]] && auth=(-H "Authorization: Bearer $GH_TOKEN")

  for ((attempt = 1; attempt <= max; attempt++)); do
    curl_exit=0
    # -L で API が返す一時的な URL へ移る（curl は別のホストへ移るときに Authorization を送らない）
    http_code="$(curl -sS -L --connect-timeout 20 --max-time 300 \
      -H "Accept: $accept" -H "X-GitHub-Api-Version: 2022-11-28" ${auth[@]+"${auth[@]}"} \
      -o "$out" -w '%{http_code}' "$url")" || curl_exit=$?
    if [[ "$curl_exit" == "0" && "$http_code" =~ ^2[0-9][0-9]$ ]]; then
      return 0
    fi
    if ! is_retryable "$curl_exit" "$http_code"; then
      echo "::error::取得に失敗しました（HTTP $http_code・curl $curl_exit。やり直さない応答）: $url" >&2
      return 1
    fi
    echo "::warning::取得に失敗しました（HTTP $http_code・curl $curl_exit、$attempt/$max 回目）: $url" >&2
    if ((attempt < max)); then
      sleep "$((delay * (1 << (attempt - 1))))"
    fi
  done
  echo "::error::$max 回やり直しても取得できませんでした（最後は HTTP $http_code・curl $curl_exit）: $url" >&2
  return 1
}

sha256_of() {
  if command -v sha256sum > /dev/null; then
    sha256sum "$1" | awk '{print $1}'
  else
    shasum -a 256 "$1" | awk '{print $1}'
  fi
}

# 引数: <ファイル> <リリースでのファイル名> <checksums.txt>
verify_checksum() {
  local file="$1" name="$2" checksums="$3" expected actual
  expected="$(awk -v n="$name" '$2 == n {print $1}' "$checksums")"
  if [[ -z "$expected" ]]; then
    echo "::error::checksums.txt に $name の行がありません" >&2
    return 1
  fi
  actual="$(sha256_of "$file")"
  if [[ "$actual" != "$expected" ]]; then
    echo "::error::$name の SHA-256 が checksums.txt と一致しません（期待: $expected・実際: $actual）" >&2
    return 1
  fi
}

# 引数: <リリースの JSON> <ファイル名>。アセットの API の URL を返す
asset_url() {
  local url
  url="$(jq -r --arg n "$2" '.assets[] | select(.name == $n) | .url' "$1")"
  if [[ -z "$url" ]]; then
    echo "::error::リリースに $2 がありません" >&2
    return 1
  fi
  echo "$url"
}

# 引数: <tarball> <展開先> <CLI>。<CLI> と、tarball にあれば <CLI>-go を展開先に置く
extract_cli() {
  local file="$1" dest="$2" tool="$3" entry
  local -a members=()
  while IFS= read -r entry; do
    entry="${entry#./}"
    [[ "$entry" == "$tool" || "$entry" == "$tool-go" ]] && members+=("$entry")
  done < <(tar -tzf "$file")
  if [[ " ${members[*]-} " != *" $tool "* ]]; then
    echo "::error::tarball に $tool がありません: $file" >&2
    return 1
  fi
  mkdir -p "$dest"
  tar -xzf "$file" -C "$dest" "${members[@]}"
}

# 引数: <ワークフローのファイル...>。install-cli に渡している CLI と版を「<CLI> <版>」で重複なく返す。
# デプロイのジョブでしか使わない版を、PR の CI でもインストールして確かめるため（#549）。
# `uses: …/install-cli` のステップの with: が `with: { tool: <CLI>, version: <版> }` の1行でなければ失敗する
used_versions() {
  awk '
    # 同じステップの if: 等は読み飛ばし、with: の行か次のステップまで見る
    pending && /with:/ && match($0, /with: *\{ *tool: *[a-z]+, *version: *[0-9.]+ *\}/) {
      line = substr($0, RSTART, RLENGTH)
      gsub(/with: *\{ *tool: *|version: *|[ ,}]+$/, "", line)
      sub(/, */, " ", line)
      print line
      found = 1
      pending = 0
      next
    }
    pending && (/with:/ || /^ *- /) {
      printf "::error::%s:%d の install-cli の with: が読めません（with: { tool: <CLI>, version: <版> } の1行で書く）\n", FILENAME, start > "/dev/stderr"
      bad = 1
      pending = 0
    }
    /uses: *[^ ]*actions\/install-cli *$/ { pending = 1; start = FNR }
    END {
      if (!found) { print "::error::install-cli の使用箇所が見つかりません" > "/dev/stderr"; bad = 1 }
      exit bad
    }
  ' "$@" | sort -u
}

main() {
  local tool="$1" version="$2"
  local repo tag os arch name work dest url

  repo="$(release_repo "$tool")"
  tag="$(release_tag "$tool" "$version")"
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  case "$(uname -m)" in
    x86_64) arch="amd64" ;;
    aarch64 | arm64) arch="arm64" ;;
    *) arch="$(uname -m)" ;;
  esac
  name="$(asset_name "$tool" "$version" "$os" "$arch")"
  work="$(mktemp -d)"
  dest="${INSTALL_CLI_DIR:-${RUNNER_TEMP:-/tmp}/install-cli}/$tool-$version"

  echo "$repo $tag の $name を API 経由で取得します"
  fetch_with_retry "$API/repos/$repo/releases/tags/$tag" "$work/release.json" "application/vnd.github+json"
  url="$(asset_url "$work/release.json" "$name")"
  fetch_with_retry "$url" "$work/$name" "application/octet-stream"
  url="$(asset_url "$work/release.json" checksums.txt)"
  fetch_with_retry "$url" "$work/checksums.txt" "application/octet-stream"
  verify_checksum "$work/$name" "$name" "$work/checksums.txt"

  extract_cli "$work/$name" "$dest" "$tool"
  rm -rf "$work"
  [[ -n "${GITHUB_PATH:-}" ]] && echo "$dest" >> "$GITHUB_PATH"
  "$dest/$tool" --version
}

# sourceされたとき（ユニットテスト）はmainを実行しない
if ! (return 0 2>/dev/null); then
  main "$@"
fi
