#!/usr/bin/env bash
# src/lib のうち、docs/ai-prompts/architecture.md で lib に置かないと決めたもの
# （外部サービスのクライアント生成・メール・Server Action・Studio用ツール）を各層へ移し、
# それを参照している import・vi.mock 等のパスを書き換える（#448）。
#
# 使い方: bash scripts/codemods/move-lib-to-layers.sh（リポジトリのルートで実行）
set -euo pipefail

# 文字列 $1 を $2 に置き換える。対象は $3 以降のパス（省略時は全 .ts・.tsx）のうち、$1 を含むファイル。
# sed -i は GNU（CI）と BSD（macOS）で書き方が違うため perl を使う。
# 置換の文字列は環境変数で渡す（perl の式に直接書くと "@/" が配列として展開されるため）
replace() {
  local from="$1" to="$2"
  shift 2
  local paths=("$@")
  if [ ${#paths[@]} -eq 0 ]; then paths=('*.ts' '*.tsx'); fi
  { git grep -lzF "$from" -- "${paths[@]}" || true; } |
    while IFS= read -r -d '' file; do
      FROM="$from" TO="$to" perl -pi -e 's/\Q$ENV{FROM}\E/$ENV{TO}/g' "$file"
    done
}

# --- 移動 ---------------------------------------------------------------------

mkdir -p src/infrastructure/resend src/emails
git mv src/lib/supabase/server.ts src/infrastructure/supabase/server.ts
git mv src/lib/supabase/server-admin.ts src/infrastructure/supabase/server-admin.ts
git mv src/lib/sanity/client.ts src/infrastructure/sanity/client.ts
git mv src/lib/stripe.ts src/infrastructure/stripe/client.ts
git mv src/lib/email/index.ts src/infrastructure/resend/client.ts
git mv src/lib/email/templates/* src/emails/
# テンプレートを描画して Resend で送る関数（NotificationService の実装から使う）
git mv src/lib/email/*.ts src/infrastructure/resend/
git mv src/lib/favorites/actions.ts "src/app/(member)/favorites/actions.ts"
git mv src/lib/product-import/* src/sanity/tools/product-import/

# --- "@/..." の参照 ------------------------------------------------------------
# 前方一致で別のパスに当たらないよう、閉じの " まで含める（server と server-admin 等）

replace '"@/lib/supabase/server"' '"@/infrastructure/supabase/server"'
replace '"@/lib/supabase/server-admin"' '"@/infrastructure/supabase/server-admin"'
replace '"@/lib/sanity/client"' '"@/infrastructure/sanity/client"'
replace '"@/lib/stripe"' '"@/infrastructure/stripe/client"'
replace '"@/lib/email/index"' '"@/infrastructure/resend/client"'
replace '"@/lib/email/templates/' '"@/emails/'
# 残りの @/lib/email/* は送信関数
replace '"@/lib/email/' '"@/infrastructure/resend/'
replace '"@/lib/product-import/' '"@/sanity/tools/product-import/'

# --- 移動で書き方が変わる相対パスの参照 ----------------------------------------

replace '"./index"' '"./client"' 'src/infrastructure/resend/*.ts'
replace '"./templates/' '"@/emails/' 'src/infrastructure/resend/*.ts'
replace '"./client"' '"@/infrastructure/sanity/client"' 'src/lib/sanity/*.ts'
replace '"./actions"' '"@/app/(member)/favorites/actions"' 'src/lib/favorites/*.tsx'
