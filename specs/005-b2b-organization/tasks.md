# Tasks: 法人会員（B2B）対応

**Input**: Design documents from `/specs/005-b2b-organization/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md（すべて確定済み）

**Tests**: CLAUDE.mdの「テスト自動選択ルール」に従い、RLSポリシー・APIルート・Webhookハンドラーは統合テスト（実DB）、純粋な計算・バリデーション関数はユニットテスト、クリティカルな業務フロー（法人セルフサインアップ〜発注〜承認〜決済）はE2Eテストを含める。

**Organization**: タスクはspec.mdのUser Story（P1〜P5）ごとにグループ化し、各フェーズが独立して実装・テスト・PR化できるようにする。1タスク=概ね1PR（差分200行以内・5ファイル以内、CLAUDE.md PRサイズ制約）を目安とする。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並行実行可能（別ファイル・依存関係なし）
- **[Story]**: 対応するUser Story（US1〜US5）
- ファイルパスは実際のコード構成（`src/domain/`, `src/repositories/`, `src/use-cases/`, `src/infrastructure/`、いずれもフラット構成）に準拠

---

## Phase 1: Setup

**Purpose**: 本機能特有の準備作業（既存プロジェクトのため初期化作業は最小限）

- [ ] T001 Clerk Dashboardで Organizations 機能を有効化する（開発・stg・prod各環境。手動設定、コード変更なし）
- [ ] T002 `.env`/Doppler設定を確認し、Clerk Organizations関連のwebhook signing secretが既存のwebhookエンドポイントと共通のまま利用できることを確認する

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 全User Storyが依存する、DBスキーマ・ドメインモデル・共通インフラ

**⚠️ CRITICAL**: このフェーズが完了するまで、どのUser Storyの実装にも着手できない

- [x] T003 Migration: `organizations`テーブル・`organization_memberships`テーブルを作成する in `supabase/migrations/<timestamp>_create_organizations.sql`（data-model.md参照。会社名・代表者名・所在地・電話番号・invoice_registration_number・rank・billing_anchor_day等・onboarding_completedを含む）
- [x] T004 [P] Migration: `orders`テーブルに`organization_id`・`requested_by_user_id`・`approval_status`・`approved_by_user_id`・`approved_at`列を追加し、`order_status` ENUMに`pending_approval`を追加する in `supabase/migrations/<timestamp>_add_organization_columns_to_orders.sql`
- [x] T005 [P] Migration: `addresses`テーブルに`organization_id`列（nullable）を追加する in `supabase/migrations/<timestamp>_add_organization_id_to_addresses.sql`
- [x] T006 [P] Migration: `users`テーブルに`phone_number`・`profile_completed_at`列を追加する in `supabase/migrations/<timestamp>_add_profile_columns_to_users.sql`
- [x] T007 Migration: `get_current_org_id()`関数の新設、および`organizations`/`organization_memberships`/`orders`/`addresses`のRLSポリシーを組織スコープに対応させる in `supabase/migrations/<timestamp>_add_organization_rls_policies.sql`（依存: T003-T006）
- [x] T008 `supabase db reset`でローカルDBに全マイグレーションを適用し、`supabase gen types typescript --local > src/types/database.types.ts`で型を再生成する（依存: T003-T007）
- [x] T009 [P] `User`ドメインエンティティに`firstName`・`lastName`・`phoneNumber`フィールドを追加する in `src/domain/entities/user.ts`（既存不備の是正、research.md R9）
- [x] T010 [P] `UserRepository`実装を修正し、`first_name`/`last_name`/`phone_number`のDBマッピングを追加する in `src/infrastructure/supabase/supabase-user-repository.ts`
- [x] T011 [P] `Organization`ドメインエンティティを新設する in `src/domain/entities/organization.ts`（`getMonthlyPeriod()`/`getMonthlyLimit()`/`isClosed()`。data-model.md参照）
- [x] T012 [P] `OrderStatus`値オブジェクトに`pending_approval`を追加する in `src/domain/value-objects/order-status.ts`
- [x] T013 [P] `ApprovalStatus`値オブジェクトを新設する in `src/domain/value-objects/approval-status.ts`（auto_approved/pending_approval/approved/rejected）
- [x] T014 [P] 組織関連のドメインエラーを新設する in `src/domain/errors/organization-errors.ts`（`SoleAdminCannotLeaveError`等）と `src/domain/errors/invalid-invoice-registration-number-error.ts`
- [x] T015 [P] `OrganizationRepository`・`OrganizationMembershipRepository`インターフェースを新設する in `src/repositories/organization-repository.ts`, `src/repositories/organization-membership-repository.ts`
- [x] T016 `SupabaseOrganizationRepository`・`SupabaseOrganizationMembershipRepository`を実装する in `src/infrastructure/supabase/supabase-organization-repository.ts`, `src/infrastructure/supabase/supabase-organization-membership-repository.ts`（依存: T011, T015）
- [x] T017 `ClerkOrganizationGateway`を新設する in `src/infrastructure/clerk/clerk-organization-gateway.ts`（`createOrganization`/`inviteMember`等、Clerk Organizations APIラッパー）
- [x] T018 ランク参照を一元化する`resolveMemberContext`を新設する in `src/domain/services/member-context-resolver.ts`（依存: T009, T011。research.md R11・contracts/server-actions.md参照）
- [x] T019 [P] Unit test: T009-T014のドメイン追加分（`Organization`エンティティ、`ApprovalStatus`、`OrderStatus.pending_approval`、`resolveMemberContext`）in `tests/unit/organization-entity.test.ts`, `tests/unit/approval-status.test.ts`, `tests/unit/member-context-resolver.test.ts`
- [x] T020 Integration test: 組織スコープのRLSアクセス制御（実DB。他組織のデータに一切アクセスできないことを検証、FR-014）in `tests/integration/use-cases/organization-scoped-access.test.ts`（依存: T007, T008）

**Checkpoint**: 基盤完成。以降のUser Storyは並行着手可能

---

## Phase 3: User Story 1 - 代表者のセルフサインアップによる法人組織作成 (Priority: P1) 🎯 MVP

**Goal**: 代表者が法人情報を入力して法人組織を作成し、その組織の管理者として発注できるようになる

**Independent Test**: 代表者アカウント1人だけで、法人登録（必須項目含む）からプラン選択・発注・月次上限チェックまでを一通り完了できる（quickstart.mdシナリオ1）

### Implementation for User Story 1

- [x] T021 [US1] `CreateOrganizationUseCase`を実装する in `src/use-cases/create-organization.ts`（会社名・代表者名・所在地・電話番号・インボイス番号のバリデーション、組織作成、作成者をorg:adminとして登録。依存: T016, T017, T014）
- [x] T022 [US1] サインアップ後の「個人/法人」選択画面を実装する in `src/app/onboarding/account-type/page.tsx`, `src/app/onboarding/account-type/actions.ts`（FR-001）
- [x] T023 [US1] 法人情報入力フォームを実装する in `src/app/onboarding/organization/page.tsx`, `src/app/onboarding/organization/actions.ts`（FR-002。依存: T021）
- [x] T024 [US1] `select-plan.ts`を拡張し、法人組織のプラン選択時は`organizations.rank`・`organizations.onboarding_completed`を更新するようにする in `src/use-cases/select-plan.ts`（依存: T011, T016）
- [x] T025 [US1] Unit test: `CreateOrganizationUseCase`（インボイス番号の形式検証、会社名重複等）in `tests/unit/use-cases/create-organization.test.ts`
- [x] T026 [US1] Integration test: 法人組織作成〜プラン選択〜1人での発注までの一連のユースケース（実DB）in `tests/integration/use-cases/organization-onboarding.test.ts`
- [x] T027 [US1] E2E test: 法人セルフサインアップ〜組織作成〜プラン選択〜発注（quickstartシナリオ1）in `tests/e2e/order/organization-signup.spec.ts`

**Checkpoint**: 法人組織を1人で作成〜発注まで完結できる状態（MVP）

---

## Phase 4: User Story 2 - 個人会員・法人代表者共通のプロフィール情報必須化 (Priority: P2)

**Goal**: 新規会員は各オンボーディング画面（個人は`/onboarding/plan`、法人代表者は`/onboarding/organization`）内で氏名・電話番号の入力を必須とする

> **設計変更（PR #143）**: 当初案は`middleware.ts`による汎用ゲート+`/profile/complete`画面で新規・既存会員を一括して扱う方式だったが、本機能は本番未リリースでFR-020（既存会員への遡及入力）の対象ユーザーが実在しないため、その部分は実装しないことにした。代わりに、氏名・電話番号は各オンボーディング画面内で完結して収集する（個人は`/onboarding/plan`に入力欄を追加、法人代表者は`/onboarding/organization`の代表者名入力を姓・名に分割してそのまま本人のプロフィールにも反映）。将来的に本番リリース後、氏名・電話番号が未入力の既存会員が発生し得る状況になった場合は、`CompleteProfileUseCase`・`middleware.ts`ゲート・`/profile/complete`画面を別タスクとして追加する。

**Independent Test**: 新規個人会員が`/onboarding/plan`で氏名・電話番号の入力を求められ、未入力または不正な形式では完了できないことを確認する。新規法人代表者が`/onboarding/organization`で代表者の姓・名・電話番号を入力すると、それが本人（`users`テーブル）のプロフィールにもそのまま反映され、別画面での再入力が発生しないことを確認する（quickstart.mdシナリオ2は要更新、別タスク）。

### Implementation for User Story 2

- [x] T028 [US2] `PhoneNumber`値オブジェクト・`InvalidPhoneNumberError`を新設する in `src/domain/value-objects/phone-number.ts`, `src/domain/errors/invalid-phone-number-error.ts`（0始まりの10〜11桁を検証。個人・法人フロー共通で使用）
- [x] T029 [US2] `/onboarding/plan`（個人フロー）に姓・名・電話番号の入力欄を追加し、`select-plan.ts`が受け取る`firstName`/`lastName`/`phoneNumber`を実際に`User`エンティティへ永続化するよう修正する in `src/app/onboarding/plan/plan-selector.tsx`, `src/app/onboarding/plan/actions.ts`, `src/use-cases/select-plan.ts`（法人フロー選択時=`organizationId`指定時はこの入力欄を表示しない）
- [x] T030 [US2] `organization-form.tsx`の代表者名入力を姓・名の2欄に分割し、郵便番号自動補完（zipcloud、`address-form.tsx`と同じ方式）を追加する in `src/app/onboarding/organization/organization-form.tsx`, `src/app/onboarding/organization/actions.ts`
- [x] T031 [US2] `create-organization.ts`を修正し、代表者の姓・名・電話番号を本人の`users.firstName`/`lastName`/`phoneNumber`にも反映する（二重入力の回避。代表者はセルフサインアップした本人であるという前提に基づく設計） in `src/use-cases/create-organization.ts`
- [x] T032 [US2] Unit test: `PhoneNumber`、`select-plan.ts`・`create-organization.ts`の追加分 in `tests/unit/phone-number.test.ts`, `tests/unit/use-cases/select-plan.test.ts`, `tests/unit/use-cases/create-organization.test.ts`
- [x] T033 [US2] Integration test: 個人フロー・法人フローそれぞれで氏名・電話番号が正しく永続化されること（実DB）in `tests/integration/select-plan.test.ts`, `tests/integration/use-cases/organization-onboarding.test.ts`

**Checkpoint**: 個人・法人代表者を問わず、新規オンボーディング時に氏名・電話番号が必須項目として機能する（既存会員への遡及対応は本番リリース後の別課題）

---

## Phase 5: User Story 3 - 管理者による追加メンバーの招待 (Priority: P3)

**Goal**: 法人組織の管理者が追加の担当者を招待し、一般担当者として組織に参加できる

**Independent Test**: 管理者が招待メールを送信し、招待された担当者がリンクから参加してメンバー一覧に一般担当者として表示される（quickstart.mdシナリオ3）

### Implementation for User Story 3

- [ ] T034 [US3] `InviteOrganizationMemberUseCase`を実装する in `src/use-cases/invite-organization-member.ts`（org:adminであることの検証、既存個人会員メールアドレスへの招待拒否を含む。FR-005, FR-023。依存: T016, T017）
- [ ] T035 [US3] Clerk webhookハンドラーを拡張し、`organization.created`/`organization.deleted`/`organizationMembership.created`/`.updated`/`.deleted`イベントを処理する in `src/app/api/webhooks/clerk/route.ts`（contracts/clerk-webhook-events.md参照。依存: T016）
- [ ] T036 [US3] 組織メンバー一覧・招待フォーム画面を実装する in `src/app/(member)/org/members/page.tsx`, `src/app/(member)/org/members/actions.ts`（依存: T034）
- [ ] T037 [US3] Unit test: `InviteOrganizationMemberUseCase`（既存個人会員メールアドレスの拒否ケース含む）in `tests/unit/use-cases/invite-organization-member.test.ts`
- [ ] T038 [US3] Integration test: Clerk webhookイベント受信〜`organization_memberships`同期（実DB）in `tests/integration/webhooks/clerk-organization-events.test.ts`

**Checkpoint**: 法人組織が複数メンバーで運用できる状態

---

## Phase 6: User Story 4 - 一般担当者による発注と管理者承認 (Priority: P4)

**Goal**: 一般担当者の発注は承認待ちになり、管理者が承認して初めて決済・請求フローに進む。ランク・月次上限は組織スコープで正しく解決される

**Independent Test**: 一般担当者が発注すると「承認待ち」になり決済・請求が開始されない。管理者の承認操作で初めて既存フローに進む（quickstart.mdシナリオ4）。組織のランクがカタログ閲覧・上限判定に正しく反映される（シナリオ5.5）

### Implementation for User Story 4

- [ ] T039 [US4] `place-order.ts`を拡張し、組織コンテキストでの発注（`activeOrganizationId`指定時）に対応する。`clerk_role`に応じて`approval_status`を`auto_approved`/`pending_approval`に分岐する in `src/use-cases/place-order.ts`（依存: T012, T013, T018）
- [ ] T040 [US4] `ApproveOrderUseCase`・`RejectOrderUseCase`を実装する in `src/use-cases/approve-order.ts`, `src/use-cases/reject-order.ts`（承認直前のメンバーシップ再検証、FR-018。依存: T016）
- [ ] T041 [US4] `MonthlyLimitService`を拡張し、組織スコープでの確定/承認待ち金額の合算に対応する in `src/domain/services/monthly-limit-service.ts`（FR-016。依存: T016）
- [ ] T042 [US4] `member-context-resolver`を既存の直接参照箇所に配線する in `src/app/(member)/shop/page.tsx`, `src/app/(member)/shop/[brand]/page.tsx`, `src/app/(member)/shop/[brand]/[id]/page.tsx`, `src/app/(member)/shop/[brand]/actions.ts`, `src/app/(member)/order/checkout/page.tsx`, `src/lib/cart/monthly-confirmed.ts`（R11・FR-024。依存: T018。7ファイルにまたがるため複数の小さいPRに分割して実施することを推奨）
- [ ] T043 [US4] 承認待ち注文一覧・承認/却下UIを実装する in `src/app/(member)/org/orders/pending/page.tsx`, `src/app/(member)/org/orders/pending/actions.ts`（依存: T040）
- [ ] T044 [US4] Unit test: 承認/却下ロジック・組織スコープ月次上限集計 in `tests/unit/use-cases/approve-order.test.ts`, `tests/unit/monthly-limit-service.test.ts`
- [ ] T045 [US4] Integration test: 承認待ちの注文が決済・請求を一切開始しないことの検証（実DB、SC-003）in `tests/integration/use-cases/pending-approval-order.test.ts`
- [ ] T046 [US4] E2E test: org:member発注→承認待ち→org:admin承認→決済フロー（quickstartシナリオ4）in `tests/e2e/order/organization-approval-flow.spec.ts`

**Checkpoint**: 法人組織内の複数担当者による発注・承認フローが完結する

---

## Phase 7: User Story 5 - 組織の共有住所帳 (Priority: P5)

**Goal**: 法人組織のメンバーが組織で共有する住所を登録・選択できる

**Independent Test**: あるメンバーが組織の住所帳に住所を登録し、別のメンバーが発注時にその住所を選択できる（quickstart.mdシナリオ5）

### Implementation for User Story 5

- [ ] T047 [US5] `create-address.ts`/`update-address.ts`/`delete-address.ts`を拡張し、`organization_id`を扱えるようにする in `src/use-cases/create-address.ts`, `src/use-cases/update-address.ts`, `src/use-cases/delete-address.ts`
- [ ] T048 [US5] 住所帳UIを拡張し、組織所属時は「個人の住所」と「組織の住所」を区別して表示・選択できるようにする in `src/app/(member)/account/addresses/page.tsx`（既存パスに合わせて調整）
- [ ] T049 [US5] Integration test: 組織住所のRLSスコープ（同組織メンバー間で共有され、他組織・個人住所とは分離される）in `tests/integration/use-cases/organization-shared-address.test.ts`

**Checkpoint**: 全User Story（P1〜P5）が独立して機能する

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 複数のUser Storyにまたがる仕上げ・エッジケース対応

- [ ] T050 [P] `withdraw.ts`を拡張し、唯一のorg:adminである場合の退会ブロック、および組織のメンバーが自分1人だけの場合の組織クローズ処理を追加する in `src/use-cases/withdraw.ts`（FR-017。依存: T016）
- [ ] T051 Unit test: `withdraw.ts`の唯一管理者ブロック・組織クローズケース in `tests/unit/use-cases/withdraw.test.ts`
- [ ] T052 Integration test: 「承認待ちの注文の発注者がメンバー除外された場合に却下扱いになる」ケース（Edge Cases）in `tests/integration/use-cases/member-removal-order-rejection.test.ts`
- [ ] T053 quickstart.mdの全シナリオ（1〜8および5.5）を手動検証する
- [ ] T054 tasks-to-linearスキルで本タスクリストをLinear issueへ変換する（Constitution 開発ワークフロー。実装着手前に必須）

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし、即着手可能
- **Foundational (Phase 2)**: Setup完了後。全User Storyをブロックする
- **User Stories (Phase 3-7)**: すべてFoundational完了後に着手可能。優先度順（P1→P2→P3→P4→P5）が推奨だが、チーム体制があれば並行可能
- **Polish (Phase 8)**: 対象のUser Story完了後（T050はUS1完了後、T052はUS4完了後）

### User Story Dependencies

- **User Story 1 (P1)**: Foundational完了後、他Storyへの依存なし
- **User Story 2 (P2)**: Foundational完了後、他Storyへの依存なし（US1と並行可能）
- **User Story 3 (P3)**: Foundational完了後。組織が存在する必要があるため実質的にUS1完了後に着手（`organization_id`はUS1で作られる）
- **User Story 4 (P4)**: US3完了後（org:memberが存在しないと承認フローを検証できない）
- **User Story 5 (P5)**: US1完了後（組織が存在する必要がある）。US3/US4への依存なし

### Parallel Opportunities

- Foundational: T004, T005, T006（別テーブルへの列追加）、T009-T015（別ファイルのドメイン新設）は並行可能
- US1のT025-T027（テスト）はT021-T024完了後に並行可能
- US1とUS2はFoundational完了後、互いに独立して並行着手可能
- T042（member-context-resolver配線）は対象ファイルごとに並行可能

---

## Parallel Example: Foundational Phase

```bash
Task: "Migration: orders テーブルに組織関連カラムを追加 in supabase/migrations/<ts>_add_organization_columns_to_orders.sql"
Task: "Migration: addresses テーブルに organization_id を追加 in supabase/migrations/<ts>_add_organization_id_to_addresses.sql"
Task: "Migration: users テーブルに phone_number 等を追加 in supabase/migrations/<ts>_add_profile_columns_to_users.sql"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup 完了
2. Phase 2: Foundational 完了（最重要ブロッカー）
3. Phase 3: User Story 1 完了
4. **STOP and VALIDATE**: quickstart.mdシナリオ1を検証
5. デプロイ・デモ可能な状態

### Incremental Delivery

1. Setup + Foundational → 基盤完成
2. US1追加 → 独立検証 → デプロイ（MVP、1人法人が使える）
3. US2追加 → 独立検証 → デプロイ（プロフィール必須化）
4. US3追加 → 独立検証 → デプロイ（複数メンバー招待）
5. US4追加 → 独立検証 → デプロイ（承認フロー、ランク一元化）
6. US5追加 → 独立検証 → デプロイ（共有住所帳）
7. Polish → 最終仕上げ

---

## Notes

- 各タスクはCLAUDE.mdの実装順序（理解度確認→テストを書く→失敗を確認→実装→テスト通過確認→コミット）に従って進める
- PRは1タスク=1責務を目安に分割する（CLAUDE.md PRサイズ制約: 差分200行以内・5ファイル以内）。T042のように対象ファイルが多いタスクは、ファイル単位でさらに小さいPRに分割してよい
- 実装着手前に、本タスクリストをtasks-to-linearスキルでLinear issue化すること（T054、Constitution 開発ワークフロー）
