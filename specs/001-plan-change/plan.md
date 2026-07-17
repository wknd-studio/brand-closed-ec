# Implementation Plan: プラン変更（アップグレード・ダウングレード）

**Branch**: `001-plan-change` | **Date**: 2026-07-17 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-plan-change/spec.md`

## Summary

会員が自分でプランのアップグレード・ダウングレードを行えるようにする。アップグレードは即時反映（Stripeの`billing_cycle_anchor: 'now'`で期間をリセット）、ダウングレードはStripe Subscription Scheduleを使って期末まで現プランを維持し、翌期間から新プランへ切り替える。技術的な設計は `docs/plan-change-flow.md`（既存の検討済みドキュメント）をベースに、既存のレイヤードアーキテクチャ（`src/domain` / `src/repositories` / `src/use-cases` / `src/infrastructure`）に沿って実装する。

**重要な前提**: 本featureは7ランクモデル（STARTER〜ENTERPRISE）への移行（BRAND-97、未着手）に依存する。現状コード（`src/domain/value-objects/member-rank.ts`）は旧5ランクモデル（free/entry/standard/pro/enterprise）のままであり、本featureの実装着手前に7ランクモデル移行のspecを別途起票し、先に完了させる必要がある（詳細はComplexity Tracking参照）。

## Technical Context

**Language/Version**: TypeScript strict, Next.js 16 App Router

**Primary Dependencies**: Stripe（Subscriptions API, Subscription Schedules API）, Supabase（PostgreSQL + RLS + supabase-js）, Clerk（認証）

**Storage**: Supabase PostgreSQL。`users` テーブルへのカラム追加が必要（後述）

**Testing**: Vitest（ユニット・統合）, Playwright（E2E）。CLAUDE.mdのテスト自動選択ルールに従い、Stripe Webhookハンドラー・DB読み書きを伴うServer Actionは統合テスト（実DB + Stripeテストモード or モック）、ドメインロジック（ランク比較・期間計算・分岐判定）はユニットテストとする

**Target Platform**: Cloudflare Pages / Workers（既存デプロイ基盤）

**Project Type**: Web application（Next.js フルスタック、既存プロジェクトへの機能追加）

**Performance Goals**: アップグレード確定操作からUIへの反映まで1分以内（spec.md SC-001）。プラン変更操作自体はStripe API呼び出し1〜2回 + DB更新1回程度で、パフォーマンス要件上の新規リスクは低い

**Constraints**: 決済処理はStripe Checkout（SAQ A）の制約に従い、カード情報を自前で扱わない。Webhookの冪等性を担保する（Stripeイベントの重複配信に対応する）

**Scale/Scope**: 対象は既存の有料会員全体（招待制クローズドECのため会員数は限定的、高トラフィックではない）

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

`.specify/memory/constitution.md` の原則Iに従い、CLAUDE.mdの各ルールとの整合を確認する。

| 原則                            | 確認内容                                                                                                           | 判定                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| I. CLAUDE.mdを正とする          | ブランチ戦略（`feature/*` → `develop`）、PRサイズ（200行/5ファイル目安）、テスト自動選択ルールとの整合を以下で確認 | ✅ PASS（下記Complexity Trackingで分割方針を明記） |
| II. 受け入れ条件の明記          | spec.mdは「会員が確認できること」「システムが保証すること」の2区分で明記済み                                       | ✅ PASS                                            |
| III. 曖昧さの解消を計画より先に | `/speckit-clarify` 実施済み（PR #84のレビューコメントを反映）                                                      | ✅ PASS                                            |
| IV. 実装記述と仕様意図の区別    | 本featureは「これから実現したい仕様」（未実装）。既存の実装記述ドキュメントは書き換えない                          | ✅ PASS                                            |
| V. 事実の単一情報源化           | 料金・ランク名・上限値は `docs/archive/service-spec.md` を参照するのみで書き写さない                               | ✅ PASS                                            |

**PRサイズについて**: 本featureは「DBスキーマ変更」「ドメインモデル拡張（User・MonthlyPeriod）」「SubscriptionGatewayの新メソッド」「changePlanユースケース」「Server Action」「Webhookハンドラー更新」「UI」と責務が多岐にわたる。CLAUDE.mdの200行/5ファイル目安を守るため、`/speckit-tasks` で生成するタスクは実装順に複数PRへ分割する前提とする（詳細はtasks.md）。

## Project Structure

### Documentation (this feature)

```text
specs/001-plan-change/
├── plan.md              # このファイル
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── change-plan.md    # Phase 1 output
└── tasks.md              # Phase 2 output（/speckit-tasksで生成）
```

### Source Code (repository root)

既存のレイヤードアーキテクチャ（`docs/architecture-refactoring.md` で計画され、実際に `src/domain` 等として既に導入済み）にそのまま追加する。新規プロジェクト構成は不要。

```text
src/
├── domain/
│   ├── entities/
│   │   └── user.ts                       # 既存。pendingRank等のフィールド追加が必要
│   └── value-objects/
│       ├── member-rank.ts                # 既存（7ランク移行が別途必要）
│       └── monthly-period.ts             # 既存。billing_anchor_day基準への変更を検討
│
├── repositories/
│   ├── user-repository.ts                # 既存。変更不要（save()で新フィールドも保存する想定）
│   └── subscription-gateway.ts           # 既存。cancelSubscriptionのみ → upgrade/downgrade用メソッド追加が必要
│
├── use-cases/
│   └── change-plan.ts                    # 新規。UpgradeとDowngradeを統合したユースケース
│
├── infrastructure/
│   └── stripe/
│       └── stripe-subscription-gateway.ts  # 既存。新メソッド実装を追加
│
└── app/
    └── (member)/mypage/plan/
        └── actions.ts                    # 新規。change-planユースケースを呼ぶ薄いServer Action
```

**Structure Decision**: 新しいトップレベル構成は導入しない。既存の `src/domain` / `src/repositories` / `src/use-cases` / `src/infrastructure` 構造にそのまま追加する（`docs/architecture-refactoring.md` の設計が既に採用されているため、それに従うのが一貫性がある）。

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified

| Violation                           | Why Needed                                                                                                                                              | Simpler Alternative Rejected Because                                                                                                                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 7ランクモデル移行への依存（未着手） | `spec.md` のFR-004等は新7ランクモデル（STARTER〜ENTERPRISE）を前提にしているが、現状コードは旧5ランクモデル（free/entry/standard/pro/enterprise）のまま | 旧モデルのまま実装すると、実装後すぐにランク移行で作り直しが発生する。7ランク移行を独立したspec（例: `specs/00X-seven-rank-pricing`）として先に完了させ、本featureはその後に着手する2段階アプローチとする |
| 1 PRに収まらない変更範囲            | DBスキーマ・ドメインモデル・Gateway・ユースケース・Server Action・Webhook・UIと責務が多い                                                               | CLAUDE.mdのPRサイズ規律に従い、`/speckit-tasks` で生成するタスクをPhase単位の複数PRに分割する（tasks.md参照）。1PRに収めるとレビュー困難になるため分割が妥当                                              |
