# CLAUDE.md

## 開発コマンド

```bash
pnpm dev                        # 開発サーバー
pnpm typecheck                  # tsc --noEmit
pnpm lint                       # eslint
pnpm format                     # prettier --write
pnpm test                       # Vitest（ユニット・統合）
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

Next.js 16 App Router + TypeScript strict / Cloudflare Pages + Workers (`@cloudflare/next-on-pages`) / Supabase PostgreSQL + RLS + supabase-js / Clerk (RBAC) / Stripe Checkout (SAQ A) / Sanity v3 / Playwright E2E / GitHub Actions CI / Linear (BRAND プロジェクト)

## ライブラリ別実装ガイド

- **Next.js**: `docs/ai-prompts/nextjs.md`を必ず参照すること
- **Clerk**: `docs/ai-prompts/clerk.md` を必ず参照すること（非推奨APIの使用禁止・`<Show>` コンポーネントの使用など重要なルールあり）

## Gitブランチ戦略（厳守）

**CRITICAL: 以下のルールを絶対に破ってはならない。**

```
main      →  本番（prod）自動デプロイ
develop   →  ステージング（stg）自動デプロイ
feature/* →  Cloudflare Pages Preview URL
```

**PR のターゲットブランチ**:

- `feature/*` → **`develop`**（通常の開発作業は常にここ）
- `develop` → `main`（stg での QA 完了後のみ）
- `hotfix/*` → `main`（緊急修正のみ。直後に `develop` へバックマージ必須）

**禁止事項**:

- `feature/*` から `main` への直接 PR・マージ（絶対禁止）
- `main` への直接 push（絶対禁止）

詳細は `requirements.md` の「4. Gitブランチ戦略」を参照。

---

## 行動ルール

**理解度チェック**: 以下のタイミングで必ず実施する。(1) 技術説明・意思決定・実装提案の後、(2) **実装を開始する前**（コード作成・コマンド実行の前に理解を確認してから着手する）。Q1（定義）Q2（理由）Q3（応用）の最大3問。ユーザーが答えられなかった場合は平易な言葉と例え話で再説明し、同じ質問を1問だけ再提示する。理解が確認できてから実装に進む。ユーザーが正答した後も確認の追加質問を1問添える。

**実装順序**: 理解度確認 → テストを書く → 失敗を確認 → 実装 → テスト通過確認 → ユーザー承認後にコミット。コミット・プッシュはユーザーの明示的な承認後のみ。

**テスト自動選択ルール**: 機能を実装するたびに、以下の基準で必要なテストを自動的に作成する。

| 実装内容                       | テスト種別         | ツール               |
| ------------------------------ | ------------------ | -------------------- |
| 純粋な計算・バリデーション関数 | ユニットテスト     | Vitest               |
| RLSポリシーを含むスキーマ変更  | 統合テスト（実DB） | Vitest + supabase-js |
| APIルート（DB読み書きあり）    | 統合テスト（実DB） | Vitest + supabase-js |
| Stripe Webhookハンドラー       | 統合テスト         | Vitest               |
| クリティカルな業務フロー全体   | E2Eテスト          | Playwright           |
| UIの見た目・レイアウト         | 不要               | —                    |

統合テストでは `SUPABASE_SERVICE_ROLE_KEY` を使い実際のローカルDBに接続する。テストの前後で作成したデータを必ずクリーンアップする（`beforeAll`/`afterAll`）。

**コミット形式**: `feat(scope): BRAND-XX 説明` (Conventional Commits)

**言語**: 常に日本語で回答する。
