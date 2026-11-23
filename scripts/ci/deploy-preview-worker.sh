#!/usr/bin/env bash
# PRごとのプレビューの Worker を、シークレットと一緒にデプロイする（#727・#731。.github/workflows/preview-deploy.yml）。
# 使い方: <Worker の secrets の JSON> | doppler run -- bash scripts/ci/deploy-preview-worker.sh brand-closed-ec-pr-<PR番号>
#
# - Worker の作成とシークレットの登録を wrangler deploy --secrets-file の1回で行う。前は wrangler secret bulk が
#   まだ無い Worker を下書き（中身の無いコード）で作り、そこへ wrangler deploy していた。新しいPRの最初のデプロイで、
#   コードを上げた直後の workers.dev の設定の読み込み（GET /workers/workers/<名前>）が「Worker が無い（10007）」で
#   失敗し、再実行すると成功した（#731）。--secrets-file は Cloudflare のドキュメントが新しい Worker をシークレットと
#   一緒に出す方法として案内しているもので、シークレットの無い状態の Worker が動く瞬間も無い
# - それでも 10007 が出たら、間を空けて再試行する（作成直後に API から見えないことがあり、手元では再現しなかったため。
#   再実行で成功している）。ほかのエラーは再試行しない
# - シークレットはランナーにファイルとして置かない（docs/cicd.md。成果物のコードが esbuild でランナーのファイルを
#   取り込めるため）。標準入力から変数に読み、試すたびに /dev/stdin へ流す
# - stg・本番の Worker に出さないよう、プレビューの名前の形（scripts/ci/preview.ts の previewWorkerName）以外は止める
# - 前提: CLOUDFLARE_API_TOKEN・CLOUDFLARE_ACCOUNT_ID（Doppler の stg_preview）、checkout の直下の .open-next
set -euo pipefail

name="${1:-}"
if [[ ! "$name" =~ ^brand-closed-ec-pr-[1-9][0-9]*$ ]]; then
  echo "::error::プレビューの Worker の名前ではないためデプロイしない: ${name}" >&2
  exit 1
fi

secrets="$(cat)"
attempts=3
wait_seconds="${PREVIEW_DEPLOY_RETRY_WAIT_SECONDS:-15}"

for ((attempt = 1; attempt <= attempts; attempt++)); do
  status=0
  output="$(printf '%s' "$secrets" | pnpm exec wrangler deploy --config wrangler.preview.jsonc --name "$name" --secrets-file /dev/stdin 2>&1)" || status=$?
  printf '%s\n' "$output"
  if [[ "$status" -eq 0 ]]; then
    exit 0
  fi
  if [[ "$output" != *"[code: 10007]"* ]]; then
    exit "$status"
  fi
  if ((attempt < attempts)); then
    echo "::warning::${name} が Cloudflare の API から見えない（10007）。${wait_seconds}秒後に再試行する（${attempt}/${attempts}）"
    sleep "$wait_seconds"
  fi
done
echo "::error::${name} のデプロイが ${attempts} 回とも 10007 で失敗した" >&2
exit 1
