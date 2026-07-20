---
description: "Task list template for feature implementation"
---

# Tasks: 会員登録・ログインフローのE2Eテスト網羅

**Input**: Design documents from `/specs/002-e2e-auth-coverage/`

**Prerequisites**: plan.md, spec.md, research.md, quickstart.md

**Story**: US1=実登録フロー（代表プラン1つ）, US2=実ログインフロー（未知デバイスの確認コード込み）

## PRサイズについて

新規ファイル3つ（helper 1・spec 2）で完結する小規模なfeatureのため、Phase 1〜5すべてを1つのPRにまとめる想定。

---

## Phase 1: Setup

- [x] T001 ローカルで`pnpm dev`を起動し、`/sign-up`・`/sign-in`の実際のDOM構造を確認して、Playwrightロケーター（`getByLabel`/`getByRole`等）を確定する（研究事項。research.md参照）

**チェックポイント**: ロケーター確定。以降の実装で迷わず使える

**T001実施中に発覚し、その後訂正・確定した事実（research.md参照）**:
(1) 招待リンク経由の登録では確認コード入力画面は表示されない（招待自体がメール確認済み扱いにするため。これは確定した仕様）。(2) ログイン時の確認コードは、当初「MFAが存在しない」と誤って結論したが、実際は**Clerkのデバイス認識ベースの仕組み**であり、見慣れないブラウザ・デバイスからのログインでのみ発動する。(3) ログインテスト用会員は動的に作成・削除するのではなく、**固定の`E2E_USER_EMAIL`/`E2E_USER_PASSWORD`アカウント（`+clerk_test`アドレスで新規に作り直し、`.env.local`・Doppler`dev`/`stg`に設定済み）を使い回す**方針に変更した（既存の`onboarding.spec.ts`と同じ資産を再利用し、Backend APIでのユーザー作成・削除の複雑さを避けるため）。実機確認済みのロケーター（`page.getByLabel("Enter verification code").fill("424242")`で自動送信される。Continueボタンのクリックは不要）もresearch.md参照。

---

## Phase 2: Foundational（全ストーリーの前提）

**⚠️ このPhaseが完了するまで、どのユーザーストーリーにも着手できない**

- [x] T002 `tests/e2e/helpers/clerk-test-invitation.ts` を新規作成する。以下を提供する（US1の登録テスト専用。US2のログインテストは固定の`E2E_USER_EMAIL`/`E2E_USER_PASSWORD`を使うため本ヘルパーは不要）:
  - `createTestInvitation(emailAddress)`: `clerkClient.invitations.createInvitation`を呼び、招待URLを返す
  - `cleanupTestUser(emailAddress)`: 該当するClerkユーザー・保留中の招待・Supabase会員レコードを削除する（招待の取消が失敗してもクリーンアップ全体は継続するベストエフォート方式）

**チェックポイント**: 招待作成・クリーンアップの共通処理が使える。各ユーザーストーリーの実装に着手可能

---

## Phase 3: User Story 1 - 実登録フロー (Priority: P1)

**Goal**: 実際の登録画面を操作して、登録が完了しStripe Checkoutへ到達できることを保証する

**Independent Test**: `quickstart.md` シナリオ1

**スコープ変更（2026-07-20）**: 当初6ランクをループする想定だったが、ランク単位の正しさはユニット・統合テストで既に担保されているため、E2Eは代表プラン（STARTER）1つに絞った（詳細はspec.mdの「スコープの決定」参照）

- [x] T003 [US1] `tests/e2e/auth/registration.spec.ts` を新規作成する。(1) T002のヘルパーで招待URL取得→遷移 (2) `/welcome`で規約同意 (3) Clerk登録フォームにパスワード入力（招待によりメールアドレスは既に確認済み扱いのため入力欄は表示されない） (4) `/onboarding/plan`遷移確認 (5) STARTERランク選択 (6) Stripe Checkout遷移確認 (7) `afterEach`でクリーンアップ、を検証する（依存: T001, T002）

**チェックポイント**: 実登録フローが独立して動作・テスト可能

---

## Phase 4: User Story 2 - 実ログインフロー・未知デバイスの確認コード込み (Priority: P1)

**Goal**: 実際のログイン画面を操作して、メールアドレス＋パスワード＋確認コードでログインが完了できることを保証する

**Independent Test**: `quickstart.md` シナリオ2

- [x] T005 [US2] `tests/e2e/auth/login.spec.ts` を新規作成する。固定の`E2E_USER_EMAIL`/`E2E_USER_PASSWORD`（既存の`onboarding.spec.ts`と同じ資産）を使い、(1) `/sign-in`でメールアドレス・パスワード入力 (2) `/sign-in/factor-two`へ遷移し確認コード入力欄が表示されることを確認 (3) `page.getByLabel("Enter verification code").fill("424242")`で入力（自動送信されるためContinueクリックは不要） (4) ログイン後の画面（`/onboarding/plan`または`/shop`）へ遷移することを確認 (5) `afterEach`でログアウト・Supabase会員レコードの後始末、を検証する（依存: T001）
- [x] T006 [US2] 同ファイルに、誤った確認コード（例: `000000`）を入力した場合にエラーが表示されログインが完了しないことを検証するテストを追加する（依存: T005）

**チェックポイント**: 実ログインフローが独立して動作・テスト可能

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T007 [P] ローカル（`pnpm test:e2e`）・CI（`e2e-pr`ジョブ）の両方で新規テストが通過することを確認する（ローカルは確認済み。CIはPR作成後に確認）
- [x] T008 [P] `docs/cicd.md`の「テスト構成」表に`registration.spec.ts`・`login.spec.ts`・`helpers/clerk-test-invitation.ts`を追記する

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
