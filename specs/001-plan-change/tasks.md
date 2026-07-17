---
description: "Task list template for feature implementation"
---

# Tasks: プラン変更（アップグレード・ダウングレード）

**Input**: Design documents from `/specs/001-plan-change/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/change-plan.md, quickstart.md

**Tests**: CLAUDE.mdのテスト自動選択ルールに従い、DB読み書きを伴うユースケース・Stripe Webhookハンドラーには統合テストを、ドメインロジック（ランク比較・期間計算）にはユニットテストを含める。

**⚠️ 前提条件（着手不可）**: 本タスクリストは7ランクモデル（STARTER〜ENTERPRISE）移行が完了していることを前提とする。移行が未完了の場合、Phase 1から着手できない（`plan.md` のComplexity Tracking参照）。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並列実行可能（別ファイル・依存なし）
- **[Story]**: US1=アップグレード（P1）, US2=ダウングレード（P2）

## PRサイズについて

CLAUDE.mdのPRサイズ規律（差分200行・5ファイル目安）に従い、Phaseごとに個別のPRとして分割することを想定する。

---

## Phase 1: Setup

- [ ] T001 `supabase migration new add_plan_change_columns` でマイグレーションファイルを作成し、`billing_anchor_day` / `stripe_subscription_schedule_id` / `pending_rank` / `initial_fee_paid_rank` を `users` テーブルに追加する（`data-model.md` のSQL参照）
- [ ] T002 `supabase db reset` でローカルDBに適用し、`supabase gen types typescript --local > src/types/database.types.ts` で型を再生成する

**チェックポイント**: DBスキーマの準備完了

---

## Phase 2: Foundational（全ストーリーの前提）

**⚠️ このPhaseが完了するまで、どのユーザーストーリーにも着手できない**

- [ ] T003 [P] `src/domain/entities/user.ts` の `UserProps` に `billingAnchorDay` / `pendingRank` / `stripeSubscriptionScheduleId` / `initialFeePaidRank` を追加し、`hasPendingDowngrade()` メソッドを実装する
- [ ] T004 [P] `src/domain/entities/user.ts` のユニットテストを `tests/unit/domain/user.test.ts` に追加する（`hasPendingDowngrade()` の真偽判定）
- [ ] T005 `src/repositories/subscription-gateway.ts` の `SubscriptionGateway` interfaceに `upgradeSubscription` / `scheduleDowngrade` / `releaseSchedule` を追加する（`contracts/change-plan.md` 参照。依存: T003）
- [ ] T006 `src/infrastructure/supabase/supabase-user-repository.ts` の `save()` が新フィールドも永続化するよう更新する（依存: T001, T003）

**チェックポイント**: ドメインモデル・Repository・Gateway interfaceの準備完了。ユーザーストーリーの実装に着手可能

---

## Phase 3: User Story 1 - アップグレード (Priority: P1) 🎯 MVP

**Goal**: 会員が上位プランへ即時アップグレードでき、仕入れ上限がリセットされる

**Independent Test**: `quickstart.md` シナリオ1（STARTER→PROアップグレード）を単独で実施できる

### Tests for User Story 1

- [ ] T007 [P] [US1] `src/infrastructure/stripe/stripe-subscription-gateway.ts` の `upgradeSubscription` 統合テストを `tests/integration/stripe-subscription-gateway.test.ts` に追加する（Stripeテストモード使用）
- [ ] T008 [P] [US1] `changePlan`（アップグレード分岐）の統合テストを `tests/integration/change-plan.test.ts` に追加する（実DB使用、`SUPABASE_SERVICE_ROLE_KEY`）

### Implementation for User Story 1

- [ ] T009 [US1] `src/infrastructure/stripe/stripe-subscription-gateway.ts` に `upgradeSubscription` を実装する（`billing_cycle_anchor: 'now'`, `proration_behavior: 'create_prorations'`。依存: T005）
- [ ] T010 [US1] `src/use-cases/change-plan.ts` を新規作成し、アップグレード分岐（初期費用差分計算・`billingAnchorDay`リセット・`initialFeePaidRank`更新）を実装する（依存: T003, T009）
- [ ] T011 [US1] `src/app/(member)/mypage/plan/actions.ts` を新規作成し、`changePlan` ユースケースを呼ぶServer Actionを実装する（依存: T010）
- [ ] T012 [US1] プラン変更画面（アップグレード確認UI）を実装する（`contracts/change-plan.md` の表示要件に従う。依存: T011）

**チェックポイント**: アップグレードが単独で動作・テスト可能

---

## Phase 4: User Story 2 - ダウングレード (Priority: P2)

**Goal**: 会員が下位プランへダウングレードでき、当月末まで現プランが維持される

**Independent Test**: `quickstart.md` シナリオ2・3（ダウングレード予約・取り消し）を単独で実施できる

### Tests for User Story 2

- [ ] T013 [P] [US2] `scheduleDowngrade` / `releaseSchedule` の統合テストを `tests/integration/stripe-subscription-gateway.test.ts` に追加する（依存: T007と同ファイル、並列実行時は要調整）
- [ ] T014 [P] [US2] `changePlan`（ダウングレード・予約取り消し分岐）の統合テストを `tests/integration/change-plan.test.ts` に追加する
- [ ] T015 [P] [US2] Stripe Webhookハンドラー（`customer.subscription.updated` のschedule分岐、`subscription_schedule.released`）の統合テストを `tests/integration/webhooks/stripe.test.ts` に追加する

### Implementation for User Story 2

- [ ] T016 [US2] `src/infrastructure/stripe/stripe-subscription-gateway.ts` に `scheduleDowngrade` / `releaseSchedule` を実装する（already-releasedエラーのフォールバック含む。依存: T005）
- [ ] T017 [US2] `src/use-cases/change-plan.ts` にダウングレード・予約取り消し分岐を追加する（依存: T010, T016）
- [ ] T018 [US2] `src/app/api/webhooks/stripe/route.ts` に `customer.subscription.updated`（schedule分岐）・`subscription_schedule.released` の処理を追加する（依存: T003, T006）
- [ ] T019 [US2] プラン変更画面にダウングレード確認・予約状況表示・取り消しUIを追加する（依存: T017）

**チェックポイント**: アップグレード・ダウングレード双方が独立して動作・テスト可能

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T020 [P] `quickstart.md` の全シナリオをステージング環境で手動検証する
- [ ] T021 [P] `docs/overview.md` の該当トピック行を `specs/001-plan-change/spec.md` へのリンクに更新する
- [ ] T022 `docs/plan-change-flow.md` を役目終了として扱い、内容が `specs/001-plan-change/` に移行済みであることを明記する（アーカイブ方針は導入済みの他ドキュメントに合わせる）

---

## Dependencies & Execution Order

- **Phase 1 (Setup)** → **Phase 2 (Foundational)**: 依存なしで開始できるが、Phase 2はPhase 1完了が前提
- **Phase 2完了 = 全ユーザーストーリーのブロッカー解除**
- **US1（Phase 3）**: Phase 2完了後に着手可能。US2への依存なし
- **US2（Phase 4）**: Phase 2完了後に着手可能。US1と同じファイル（`change-plan.ts`, `subscription-gateway.ts`）を拡張するため、実質的にはUS1完了後の着手を推奨（スペック上は独立だが、同一ファイルの競合を避けるため）
- **Phase 5 (Polish)**: US1・US2完了後

## Suggested PR Split（CLAUDE.mdのPRサイズ規律に対応）

1. PR1: Phase 1 + Phase 2（T001〜T006） — スキーマ・ドメインモデル・Gateway interface
2. PR2: Phase 3（T007〜T012） — アップグレード一式（MVP）
3. PR3: Phase 4（T013〜T019） — ダウングレード一式
4. PR4: Phase 5（T020〜T022） — ドキュメント更新・最終検証

## Implementation Strategy

### MVP First

Phase 1 → Phase 2 → Phase 3（US1）で一旦止めてステージングで検証。アップグレードのみでもリリース可能な価値がある。

### Incremental Delivery

Phase 3（US1）→ Phase 4（US2）の順で追加し、それぞれのチェックポイントで独立して検証・デプロイする。
