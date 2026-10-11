#!/usr/bin/env bash
# 並列開発用ワークツリーの準備（Orcaのsetupフックから呼ぶ。docs/dev-parallel-worktrees.md参照）。
#
# - 空きスロット（2〜9）を排他的に確保し、このワークツリー専用のローカルSupabaseを起動する
#   （スロット1はメインのチェックアウトの `task dev` 用に予約）
# - テスト・開発サーバー用の環境変数を .env.worktree に書き出す
# - 何度実行しても同じスロットを再利用する（冪等）
#
# スロットの確保状況は、全ワークツリーで共有されるgitの共通ディレクトリ
# （<git-common-dir>/worktree-slots/<N>/owner）に記録する。片付けは scripts/worktree-archive.sh。

set -euo pipefail

cd "$(dirname "$0")/.."
WORKTREE_DIR="$(pwd -P)"
# shellcheck source=scripts/worktree-slot-lib.sh
source scripts/worktree-slot-lib.sh

if [ "$(git rev-parse --path-format=absolute --git-common-dir)" = "$(git rev-parse --path-format=absolute --git-dir)" ]; then
  echo "メインのチェックアウトではスロット分離を行いません（スロット1の既定設定で task dev を使う）" >&2
  exit 0
fi

echo "==> pnpm install"
pnpm install

if ! doppler configure get config --plain 2>/dev/null | grep -q .; then
  echo "==> doppler setup（.doppler.yaml の project/config を使う）"
  # .doppler.yaml は doppler setup --no-interactive が自動で読む形式ではないため、値を取り出して渡す
  doppler setup --no-interactive \
    --project "$(sed -n 's/^ *project: *//p' .doppler.yaml)" \
    --config "$(sed -n 's/^ *config: *//p' .doppler.yaml)"
fi

SLOT="$(claim_slot "$WORKTREE_DIR")"
APP_PORT=$((3000 + (SLOT - 1) * 1000))
echo "==> スロット${SLOT}を使用（アプリポート: ${APP_PORT}）"

if ! grep -q "^project_id = \".*-slot${SLOT}\"$" supabase/config.toml; then
  # 別スロット用に書き換え済みの場合に備え、いったん元に戻してから書き換える
  git update-index --no-skip-worktree supabase/config.toml
  git checkout -- supabase/config.toml
  python3 scripts/patch-supabase-slot.py supabase/config.toml "$SLOT"
fi
# このワークツリーだけのローカル変更を誤ってコミットしないようにする
git update-index --skip-worktree supabase/config.toml

echo "==> Supabase起動（CIと同じ最小構成）"
# 新規プロジェクトの初回起動時はマイグレーションとシードが適用される
supabase start -x storage,imgproxy,realtime,edge-runtime,functions,analytics,vector,inbucket,studio,meta

eval "$(supabase status -o env | sed 's/^/export /')"
cat > .env.worktree <<EOF
# scripts/worktree-setup.sh が生成（.env* として gitignore 済み）。
# Dopplerの値より優先させるため、doppler run の内側で読み込む:
#   doppler run -- env \$(grep -v '^#' .env.worktree | xargs) pnpm test:integration
WORKTREE_SLOT=${SLOT}
PORT=${APP_PORT}
NEXT_PUBLIC_APP_URL=http://localhost:${APP_PORT}
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${PUBLISHABLE_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SECRET_KEY}
EOF

echo ""
echo "ワークツリーの準備が完了しました: スロット${SLOT} / アプリ http://localhost:${APP_PORT} / Supabase API ${API_URL}"
