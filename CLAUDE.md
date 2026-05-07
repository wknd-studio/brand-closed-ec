# CLAUDE.md

## 開発コマンド

```bash
pnpm dev                        # 開発サーバー
pnpm typecheck                  # tsc --noEmit
pnpm lint                       # eslint
pnpm format                     # prettier --write
pnpm test:e2e                   # Playwright E2E
pnpm test:e2e --ui              # Playwright UIモード

supabase start                  # ローカルDB起動
supabase migration new <name>   # マイグレーション作成
supabase db reset               # ローカルDBに適用
supabase gen types typescript --local > src/types/database.types.ts

wrangler pages secret put <KEY> # シークレット設定
wrangler pages deployment tail  # ログ確認
sanity deploy                   # Sanity Studio デプロイ
```

## 技術スタック

Next.js 16 App Router + TypeScript strict / Cloudflare Pages + Workers (`@cloudflare/next-on-pages`) / Supabase PostgreSQL + RLS + Drizzle ORM / Clerk (RBAC) / Stripe Checkout (SAQ A) / Sanity v3 / Playwright E2E / GitHub Actions CI / Linear (BRAND プロジェクト)

## 行動ルール

**理解度チェック**: 以下のタイミングで必ず実施する。(1) 技術説明・意思決定・実装提案の後、(2) **実装を開始する前**（コード作成・コマンド実行の前に理解を確認してから着手する）。Q1（定義）Q2（理由）Q3（応用）の最大3問。ユーザーが答えられなかった場合は平易な言葉と例え話で再説明し、同じ質問を1問だけ再提示する。理解が確認できてから実装に進む。ユーザーが正答した後も確認の追加質問を1問添える。

**実装順序**: 理解度確認 → テストを書く → 失敗を確認 → 実装 → テスト通過確認 → ユーザー承認後にコミット。コミット・プッシュはユーザーの明示的な承認後のみ。

**コミット形式**: `feat(scope): BRAND-XX 説明` (Conventional Commits)

**言語**: 常に日本語で回答する。
