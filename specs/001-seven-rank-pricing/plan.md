# Implementation Plan: 7ランクモデルへの移行

**Branch**: `001-seven-rank-pricing` | **Date**: 2026-07-20 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-seven-rank-pricing/spec.md`

## Summary

現行の5ランクモデル（free/entry/standard/pro/enterprise）を、`docs/archive/service-spec.md`で確定している7ランクモデル（STARTER/BASIC/STANDARD/PRO/ADVANCED/PREMIUM/ENTERPRISE）に置き換える。新機能の追加ではなく、既存の値・型の置き換えであるため、影響範囲の**完全な洗い出しと同時更新**が最大のリスクになる。

## Technical Context

**Language/Version**: TypeScript strict, Next.js 16 App Router

**Primary Dependencies**: Supabase（PostgreSQL、`member_rank` enum型）, Sanity CMS（商品の`min_rank`・`prices`フィールド）, Stripe（ランクごとの価格/Price ID）, Clerk

**Storage**: Supabase PostgreSQL。`member_rank` enum型の変更、既存会員データのランク対応付け（バックフィル）が必要

**Testing**: Vitest（ユニット・統合）, Playwright（E2E）。CLAUDE.mdの基準に従い、ランク判定ロジック（アクセス制御・上限比較）はユニットテスト、DB・Sanityを読み書きする箇所は統合テスト、会員登録〜カタログ閲覧〜注文確定の一連の流れはE2Eテストとする（クリティカルな業務フロー全体に該当）

**Target Platform**: Cloudflare Pages / Workers, Sanity Studio

**Project Type**: 既存Webアプリケーションへの横断的な値・型の置き換え

**Performance Goals**: 移行前後でパフォーマンス要件に変化なし

**Constraints**: Postgresの enum型は値のリネーム・削除が単純な`ALTER TYPE`では出来ない（新しい値の追加は可能だが、既存値の意味変更は型の作り直しが必要になる場合がある）。移行中に新規登録・既存会員のアクセスが壊れないようにする

**Scale/Scope**: 招待制クローズドECのため対象会員数は限定的。ただし影響コード箇所は多い（下記「重複しているランク定義の棚卸し」参照）

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| 原則                            | 確認内容                                                                                                                           | 判定                                               |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| I. CLAUDE.mdを正とする          | ブランチ戦略・PRサイズ・テスト自動選択ルールとの整合を以下で確認                                                                   | ✅ PASS（Complexity Trackingで分割方針を明記）     |
| II. 受け入れ条件の明記          | spec.mdは「会員・運営者が確認できること」「システムが保証すること」の2区分で明記済み                                               | ✅ PASS                                            |
| III. 曖昧さの解消を計画より先に | ビジネスサイドとは別途合意済みのため`/speckit-clarify`は省略（ユーザー承認済み）。spec.md内に`[NEEDS CLARIFICATION]`は残っていない | ✅ PASS                                            |
| IV. 実装記述と仕様意図の区別    | 本featureは「これから実現したい仕様」。既存の実装記述ドキュメント（`docs/archive/`）は書き換えない                                 | ✅ PASS                                            |
| V. 事実の単一情報源化           | **重要**: 現状ランク定義が5箇所以上に重複している（下記参照）。本featureで単一情報源化まで行う                                     | ⚠️ PASS（下記Complexity Trackingで対応方針を明記） |

### 重複しているランク定義の棚卸し（移行時に同時更新が必須）

| 箇所                                                 | 内容                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/domain/value-objects/member-rank.ts`            | `RANK_ORDER`, `MONTHLY_LIMITS`, `MemberRank`クラス                                                  |
| `src/lib/sanity/products.ts`                         | 独自の`RANK_ORDER`, `MemberRank`型, `getAllowedRanks()`, `isProductAccessible()`                    |
| `src/lib/constants/membership.ts`                    | 独自の`MONTHLY_LIMITS`（`lib/sanity/products`の型を参照）                                           |
| `src/app/onboarding/plan/actions.ts`                 | `VALID_PLANS`配列（ハードコード）                                                                   |
| `src/app/onboarding/plan/plan-selector.tsx`          | `PLANS`表示用配列（ハードコード）                                                                   |
| `src/lib/stripe.ts`                                  | `PaidRank`型（`"entry" \| "standard" \| "pro"`）・`STRIPE_PRICE_IDS`・`STRIPE_PRICE_ID_*`環境変数名 |
| `supabase/migrations/*`                              | `member_rank` enum型（`users.rank`, `orders.rank_at_order`, `order_items`が参照）                   |
| `scripts/seed-users.ts` / `scripts/seed-products.ts` | シード用スクリプトのハードコード値（開発用。優先度は低いがPolishフェーズで更新）                    |

**方針**: `src/domain/value-objects/member-rank.ts` を唯一の正とし、`src/lib/sanity/products.ts` の`RANK_ORDER`/`MemberRank`型・`src/lib/constants/membership.ts`の`MONTHLY_LIMITS`は独自定義をやめてdomain層からimportするよう変更する（架空の新規リファクタリングではなく、7ランクの値を安全に反映させるために必須の対応）。UI側のハードコード配列（`VALID_PLANS`, `PLANS`）も同様にdomain層の`RANK_ORDER`から動的に生成する。`src/lib/stripe.ts`の`PaidRank`型・`STRIPE_PRICE_IDS`も7ランク分に拡張し、環境変数名を新ランク名に合わせる。

**補足（BRAND-97の記述との差分）**: 商品ごとの掛け率（割引率）は、計算式ではなく`Product.prices`（Sanityの`prices`フィールド）にランクごとの絶対価格を直接持たせる形で既に実装されている。新規のロジック実装は不要で、既存商品データに7ランク分の価格を追加するだけで足りる（`data-model.md`・`tasks.md` T014参照）。

## Project Structure

### Documentation (this feature)

```text
specs/001-seven-rank-pricing/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
└── tasks.md
```

### Source Code（変更対象の実ファイル）

```text
src/
├── domain/value-objects/member-rank.ts     # 唯一の正として7ランクの値・上限額を定義
├── lib/
│   ├── sanity/products.ts                  # 独自RANK_ORDER定義を削除しdomain層から再export
│   └── constants/membership.ts             # 独自MONTHLY_LIMITS定義を削除しdomain層から参照
├── sanity/schemas/product.ts               # RANK_OPTIONSを7ランクに更新（Sanity Studio側）
├── app/onboarding/plan/
│   ├── actions.ts                          # VALID_PLANSをdomain層のRANK_ORDERから生成
│   └── plan-selector.tsx                   # PLANS表示をdomain層のRANK_ORDERから生成
├── app/(member)/shop/**                    # カタログ表示・アクセス制御（ロジック変更は不要、値の置き換えのみ）
├── app/api/webhooks/stripe/route.ts        # MemberRankValue型の更新に追従
└── types/database.types.ts                 # supabase gen typesで再生成（手動編集しない）

supabase/migrations/
└── NNNNNN_migrate_member_rank_to_seven_tiers.sql   # 新規。enum型の移行・既存データのバックフィル
```

**Structure Decision**: 新規ディレクトリは不要。既存ファイルの値・型を置き換え、重複定義を解消する。

## Complexity Tracking

| Violation                                              | Why Needed                                                                                                                                                                 | Simpler Alternative Rejected Because                                                                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ランク定義の重複解消を本featureに含める                | 7ランクの値を5箇所以上に個別に反映すると、1箇所でも更新漏れがあれば静かに壊れる（例: `lib/sanity/products.ts`の更新を忘れると商品アクセス制御が旧5ランクのまま動き続ける） | 重複を放置したまま値だけ7ランクに置き換える案は、実質的に同じリスクを抱えたままなので却下                                                                                                |
| DBスキーマ変更を伴う1PRが200行/5ファイルを超える可能性 | `member_rank` enum型の変更は関連する複数テーブル・複数コード箇所に波及する                                                                                                 | CLAUDE.mdの規律に従い、`tasks.md`でPhase単位のPR分割案を明記する。Foundational Phase（enum型変更＋domain層）はTypeScriptの型システム上分割不可なため、理由を明記した上でPR説明に記載する |
