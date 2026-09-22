#!/usr/bin/env bash
# 並列実装用のgit worktreeを作成し、そのworktree専用のSupabaseローカルスタックを
# 起動する（最大4並列。docs/dev-parallel-worktrees.md参照）。
#
# 使い方:
#   scripts/worktree-setup.sh <issue番号やブランチ名の一部> <スロット番号1-4> [--full]
#
# 例:
#   scripts/worktree-setup.sh 226 2
#   → ../wt-226 に feature/226 ブランチのworktreeを作成し、slot2のポートで起動
#
# --full を付けると、CIと同じ最小構成（api/db/authのみ）ではなく、
# Supabase Studio等を含むフルスタックを起動する（Docker負荷が上がる）。

set -euo pipefail

if [ $# -lt 2 ]; then
  echo "使い方: $0 <issue番号> <スロット番号1-4> [--full]" >&2
  exit 1
fi

ISSUE_REF="$1"
SLOT="$2"
FULL_STACK="${3:-}"

if ! [[ "$SLOT" =~ ^[1-4]$ ]]; then
  echo "スロット番号は1〜4で指定してください: $SLOT" >&2
  exit 1
fi

REPO_ROOT="$(git rev-parse --show-toplevel)"
WORKTREE_DIR="$(cd "$REPO_ROOT/.." && pwd)/wt-${ISSUE_REF}"
BRANCH="feature/${ISSUE_REF}"

if [ -e "$WORKTREE_DIR" ]; then
  echo "既に存在します: $WORKTREE_DIR" >&2
  exit 1
fi

echo "==> origin/developを取得"
git -C "$REPO_ROOT" fetch origin develop

echo "==> worktree作成: $WORKTREE_DIR (branch: $BRANCH)"
git -C "$REPO_ROOT" worktree add "$WORKTREE_DIR" -b "$BRANCH" origin/develop

cd "$WORKTREE_DIR"

APP_PORT=3000
if [ "$SLOT" != "1" ]; then
  echo "==> supabase/config.tomlをslot${SLOT}用にローカル書き換え（コミットしない）"
  python3 "$REPO_ROOT/scripts/patch-supabase-slot.py" "supabase/config.toml" "$SLOT"
  # このworktree内だけの変更をgitに「無視」させ、誤って差分に混ざるのを防ぐ
  git update-index --skip-worktree supabase/config.toml
  APP_PORT=$((3000 + (SLOT - 1) * 1000))
fi

echo "==> pnpm install"
pnpm install

echo "==> Supabase起動"
if [ "$FULL_STACK" = "--full" ]; then
  supabase start
else
  # CIと同じ最小構成（api/db/authのみ）。4並列時のDocker負荷を抑える。
  # Supabase StudioでDBを見たい場合は --full を付けて再実行するか、
  # このworktree内で `supabase stop` してから `supabase start` を単体実行する
  supabase start -x storage,imgproxy,realtime,edge-runtime,functions,analytics,vector,inbucket,studio,meta
fi

echo "==> マイグレーション適用（supabase db reset）"
supabase db reset

echo "==> .env.worktree を生成"
eval "$(supabase status -o env | sed 's/^/export /')"
cat > .env.worktree <<EOF
# scripts/worktree-setup.sh が生成。.env*としてgitignore対象（コミットされない）。
# 使い方: doppler run -- env \$(cat .env.worktree | xargs) pnpm dev
# もしくは各testスクリプトの前に読み込んで使う
WORKTREE_SLOT=${SLOT}
PORT=${APP_PORT}
NEXT_PUBLIC_APP_URL=http://localhost:${APP_PORT}
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_ANON_KEY=${PUBLISHABLE_KEY}
SUPABASE_SERVICE_ROLE_KEY=${SECRET_KEY}
EOF

echo ""
echo "==================================================================="
echo "worktree準備完了: $WORKTREE_DIR"
echo "  スロット: $SLOT / アプリポート: $APP_PORT"
echo ""
echo "VS Codeで開く:   code \"$WORKTREE_DIR\""
echo "統合テスト実行:   cd \"$WORKTREE_DIR\" && task test:integration:worktree"
echo "E2Eテスト実行:    cd \"$WORKTREE_DIR\" && task test:e2e:worktree"
echo "==================================================================="
