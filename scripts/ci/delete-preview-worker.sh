#!/usr/bin/env bash
# PRごとのプレビューの Worker を削除する（#727。.github/workflows/preview.yml）。
# 使い方: doppler run -- bash scripts/ci/delete-preview-worker.sh brand-closed-ec-pr-<PR番号>
#
# - stg・本番の Worker を消さないよう、プレビューの名前の形（scripts/ci/preview.ts の previewWorkerName）
#   以外は Cloudflare の API を呼ぶ前に止める
# - まだ出していない（マイグレーションを含むPR等）・もう消した Worker は、何もせずに成功する
# - 前提: CLOUDFLARE_API_TOKEN・CLOUDFLARE_ACCOUNT_ID（Doppler の stg_preview）
set -euo pipefail

name="${1:-}"
if [[ ! "$name" =~ ^brand-closed-ec-pr-[1-9][0-9]*$ ]]; then
  echo "::error::プレビューの Worker の名前ではないため消さない: ${name}" >&2
  exit 1
fi

status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/workers/services/${name}")"
case "$status" in
  404)
    echo "${name} は無い（出していない・削除済み）"
    ;;
  200)
    pnpm exec wrangler delete --config wrangler.preview.jsonc --name "$name" --force
    ;;
  *)
    echo "::error::${name} の有無を確かめられない（HTTP ${status}）" >&2
    exit 1
    ;;
esac
