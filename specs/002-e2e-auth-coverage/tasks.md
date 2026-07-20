---
description: "Task list template for feature implementation"
---

# Tasks: 会員登録・ログインフローのE2Eテスト網羅

**Input**: Design documents from `/specs/002-e2e-auth-coverage/`

**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Story**: US1=実登録フロー（6ランク）, US2=実ログインフロー（メール2段階認証）

## PRサイズについて

新規ファイル3つ（helper 1・spec 2）で完結する小規模なfeatureのため、Phase 1〜5すべてを1つのPRにまとめる想定。

---

## Phase 1: Setup

- [ ] T001 ローカルで`pnpm dev`を起動し、`/sign-up`・`/sign-in`の実際のDOM構造を確認して、Playwrightロケーター（`getByLabel`/`getByRole`等）を確定する（研究事項。research.md参照）

**チェックポイント**: ロケーター確定。以降の実装で迷わず使える

---

## Phase 2: Foundational（全ストーリーの前提）

**⚠️ このPhaseが完了するまで、どのユーザーストーリーにも着手できない**

- [ ] T002 `tests/e2e/helpers/clerk-test-invitation.ts` を新規作成する。以下を提供する:
  - `createTestInvitation(emailAddress)`: `clerkClient.invitations.createInvitation`を呼び、招待URLを返す
  - `cleanupTestUser(emailAddress)`: 該当するClerkユーザー・Supabase会員レコードを削除する

**チェックポイント**: 招待作成・クリーンアップの共通処理が使える。各ユーザーストーリーの実装に着手可能

---

## Phase 3: User Story 1 - 実登録フロー・6ランク (Priority: P1)

**Goal**: 実際の登録画面を操作して、6ランクいずれでも登録が完了しStripe Checkoutへ到達できることを保証する

**Independent Test**: `quickstart.md` シナリオ1

- [ ] T003 [US1] `tests/e2e/auth/registration.spec.ts` を新規作成する。STARTER〜PREMIUMの6ランクをループし、それぞれ (1) T002のヘルパーで招待URL取得→遷移 (2) `/welcome`で規約同意 (3) Clerk登録フォームにメールアドレス・パスワード入力 (4) 確認コード`424242`入力 (5) `/onboarding/plan`遷移確認 (6) 該当ランク選択 (7) Stripe Checkout遷移確認 (8) `afterEach`でクリーンアップ、を検証する（依存: T001, T002）
- [ ] T004 [US1] 同ファイルに、誤った確認コード（例: `000000`）を入力した場合にエラーが表示され次に進まないことを検証するテストを追加する（依存: T003）

**チェックポイント**: 実登録フローが6ランク全てで独立して動作・テスト可能

---

## Phase 4: User Story 2 - 実ログインフロー・メール2段階認証 (Priority: P1)

**Goal**: 実際のログイン画面を操作して、パスワード＋メール2段階認証コードでログインが完了できることを保証する

**Independent Test**: `quickstart.md` シナリオ2

- [ ] T005 [US2] `tests/e2e/auth/login.spec.ts` を新規作成する。事前準備で登録済みの状態のテスト会員を作成し、(1) `/sign-in`でメールアドレス・パスワード入力 (2) 2段階認証コード`424242`入力 (3) ログイン後の画面へ遷移することを確認 (4) `afterEach`でクリーンアップ、を検証する（依存: T001, T002）
- [ ] T006 [US2] 同ファイルに、誤った2段階認証コードを入力した場合にエラーが表示されログインが完了しないことを検証するテストを追加する（依存: T005）

**チェックポイント**: 実ログインフローが独立して動作・テスト可能

---

## Phase 5: Polish & Cross-Cutting Concerns

- [ ] T007 [P] ローカル（`pnpm test:e2e`）・CI（`e2e-pr`ジョブ）の両方で新規テストが通過することを確認する
- [ ] T008 [P] `docs/cicd.md`の「テスト構成」表に`registration.spec.ts`・`login.spec.ts`・`helpers/clerk-test-invitation.ts`を追記する

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: 依存なしで開始できる
- **Phase 2 (Foundational)**: Phase 1完了後。完了までどのUser Storyにも着手できない
- **US1・US2（Phase 3・4）**: Phase 2完了後、それぞれ独立して着手できる（別ファイルのため並行可能）
- **Phase 5 (Polish)**: US1・US2完了後

## Implementation Strategy

### MVP First

Phase 1 → Phase 2 → Phase 3（US1: 登録）で一旦止めて検証。登録フローのカバレッジだけでも独立した価値がある。

### Incremental Delivery

Phase 2完了後、US1・US2を並行して進められる。全て完了後にPhase 5で最終確認する。
