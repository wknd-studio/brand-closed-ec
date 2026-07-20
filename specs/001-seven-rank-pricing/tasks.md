---
description: "Task list template for feature implementation"
---

# Tasks: 7ランクモデルへの移行

**Input**: Design documents from `/specs/001-seven-rank-pricing/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, quickstart.md

**Tests**: CLAUDE.mdのテスト自動選択ルールに従い、ランク判定ロジック（ユニット）、DB/Sanity読み書き（統合）、登録〜カタログ〜注文確定の一連の流れ（E2E）を含める。

**Story**: spec.mdのUser Storyは「独立した新機能」ではなく「移行後も保証すべき既存の会員体験の領域」。US1=登録, US2=カタログ, US3=上限チェック, US4=注文スナップショット。

**Linear**: 本タスク一式は `BRAND-97`（親issue）のサブissueとして起票する。

## PRサイズについて

Foundationalフェーズ（ランク値の変更＋重複解消）は、値だけ変えて呼び出し側の更新を怠ると**コンパイルは通るが実行時に静かに壊れる**（`lib/sanity/products.ts`等が独自の型定義を持っているため）。したがってFoundationalフェーズは分割せず1PRとする。それ以外は各User Storyの領域ごとに独立したPRにできる。

---

## Phase 1: Setup

- [x] T001 Stripeテストモードで7ランク分のProduct/Priceを作成し、Price IDの対応表を`docs/archive/service-spec.md`の料金表と突き合わせて記録する（`stripe-price-ids.md`参照）
- [x] T002 [P] `src/sanity/schemas/product.ts` の `RANK_OPTIONS` を7ランクに更新する（`prices`オブジェクトの各ランクフィールドも合わせて更新）

**チェックポイント**: 外部サービス（Stripe/Sanity）側の準備完了

---

## Phase 2: Foundational（全ストーリーの前提・分割不可）

**⚠️ このPhaseが完了するまで、どのユーザーストーリーにも着手できない**

- [ ] T003 `supabase migration new add_seven_rank_values` で `member_rank` enum型に7つの新しい値（`starter`, `basic`, `advanced`, `premium`）を追加するマイグレーションを作成する（`standard`/`pro`/`enterprise`は既存値を流用。`data-model.md`のSQL参照）
- [ ] T004 `supabase db reset` で適用し、`supabase gen types typescript --local > src/types/database.types.ts` で型を再生成する（依存: T003）
- [ ] T005 `src/domain/value-objects/member-rank.ts` の `RANK_ORDER`・`MONTHLY_LIMITS` を7ランクに更新する（月間仕入れ上限はTBDのため`docs/archive/service-spec.md`確定後に反映。それまでは暫定値かつ`TODO`コメントを残す）
- [ ] T006 [P] `src/domain/value-objects/member-rank.ts` のユニットテストを更新する（`tests/unit/domain/member-rank.test.ts`。7ランクの序列比較・上限取得を検証。依存: T005）
- [ ] T007 `src/lib/sanity/products.ts` の独自`RANK_ORDER`/`MemberRank`型定義を削除し、`src/domain/value-objects/member-rank.ts`からimportするよう変更する（依存: T005）
- [ ] T008 `src/lib/constants/membership.ts` の独自`MONTHLY_LIMITS`定義を削除し、`MemberRank.getMonthlyLimit()`を使うよう呼び出し側（`src/lib/cart/monthly-confirmed.ts`）を更新する（依存: T005）
- [ ] T009 `src/lib/stripe.ts` の `PaidRank`型・`STRIPE_PRICE_IDS`・`STRIPE_PRICE_ID_*`環境変数名を7ランク分に拡張する（依存: T001, T005）

**チェックポイント**: ランク定義が単一情報源化され、7ランクの値がドメイン層に反映されている。各領域の実装に着手可能

---

## Phase 3: User Story 1 - 会員登録・オンボーディング (Priority: P1)

**Goal**: 新規会員が7ランクから選択して登録できる

**Independent Test**: `quickstart.md` シナリオ1

### Tests

- [ ] T010 [P] [US1] `selectPlan`ユースケースの統合テストを更新する（`tests/integration/select-plan.test.ts`。7ランクのいずれでも登録できることを検証）

### Implementation

- [ ] T011 [US1] `src/app/onboarding/plan/actions.ts` の `VALID_PLANS` を `RANK_ORDER`（`enterprise`を除く6つ）から動的に生成するよう変更する（依存: T005, T009）
- [ ] T012 [US1] `src/app/onboarding/plan/plan-selector.tsx` の `PLANS` 表示配列を7ランク（STARTER〜PREMIUM）に更新し、日本語ラベルを`docs/archive/service-spec.md`のプラン概要表に合わせる（依存: T005）

**チェックポイント**: 会員登録が7ランクで独立して動作・テスト可能

---

## Phase 4: User Story 2 - 商品カタログの閲覧・購入制限 (Priority: P1)

**Goal**: 会員が自ランクでアクセス可能な商品のみ閲覧できる

**Independent Test**: `quickstart.md` シナリオ2

### Tests

- [ ] T013 [P] [US2] `isProductAccessible`/`getAllowedRanks`のユニットテストを更新する（`tests/unit/lib/sanity/products.test.ts`。7ランクでの境界値を検証）
- [ ] T014 [P] [US2] カタログ取得（`fetchProducts`等）の統合テストを更新する（`tests/integration/sanity/products.test.ts`）

### Implementation

- [ ] T015 [US2] Sanity Studio上の既存商品ドキュメントの`min_rank`・`prices`を7ランクの値に更新する（件数次第で手動またはスクリプト。依存: T002）
- [ ] T016 [US2] `src/app/(member)/shop/**` の表示箇所で7ランクの値が正しく扱われることを確認する（ロジック変更は不要な想定。依存: T007）

**チェックポイント**: カタログのアクセス制御が7ランクで独立して動作・テスト可能

---

## Phase 5: User Story 3 - 月次仕入れ上限のチェック (Priority: P1)

**Goal**: 会員のランクに応じた新しい上限値で正しく判定される

**Independent Test**: `quickstart.md` シナリオ3

### Tests

- [ ] T017 [P] [US3] `getMonthlyUsageInfo`の統合テストを更新する（`tests/integration/cart/monthly-confirmed.test.ts`。7ランクの上限値で判定されることを検証）

### Implementation

- [ ] T018 [US3] `src/app/(member)/order/checkout/page.tsx`・関連Server Actionで上限超過メッセージが7ランクの値で正しく表示されることを確認する（依存: T008）

**チェックポイント**: 上限チェックが7ランクで独立して動作・テスト可能

---

## Phase 6: User Story 4 - 注文確定時のランクスナップショット (Priority: P2)

**Goal**: 注文確定後にランクが変わってもスナップショットが保持される

**Independent Test**: `quickstart.md` シナリオ4

### Tests

- [ ] T019 [P] [US4] 注文確定ユースケースの統合テストを更新する（`tests/integration/use-cases/place-order.test.ts`。`rankAtOrder`が7ランクの値で保存され、後からランク変更しても変わらないことを検証）

### Implementation

- [ ] T020 [US4] `src/domain/entities/order.ts`・関連リポジトリで型エラーが出ないことを確認する（型は`MemberRankValue`を参照しているため、T005の変更が自動的に反映される想定。追加実装は基本的に不要）

**チェックポイント**: 全User Storyが独立して動作・テスト可能

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T021 [P] `scripts/seed-users.ts`・`scripts/seed-products.ts`のハードコード値を7ランクに更新する
- [ ] T022 [P] `quickstart.md` の全シナリオをステージング環境で手動検証する
- [ ] T023 [P] `pnpm test:e2e` で登録〜カタログ〜注文確定のE2Eを実行する
- [ ] T024 `docs/overview.md` の該当トピック行を `specs/001-seven-rank-pricing/spec.md` へのリンクに更新する
- [ ] T025 旧ランク値（`free`, `entry`）を使うコードが残っていないことを確認した上で、`member_rank` enum型から旧値を削除する後続タスクをLinearに別途起票する（本feature後のフォローアップとし、本featureのスコープには含めない。`research.md`のenum移行方針参照）

---

## Dependencies & Execution Order

- **Phase 1 (Setup)**: 依存なしで開始できる
- **Phase 2 (Foundational)**: Phase 1完了後。**分割不可の1PR**。完了までどのUser Storyにも着手できない
- **US1〜US4（Phase 3〜6）**: Phase 2完了後、それぞれ独立して着手・PR化できる
- **Phase 7 (Polish)**: 全User Story完了後

## Suggested PR Split（CLAUDE.mdのPRサイズ規律に対応）

1. PR1: Phase 1 + Phase 2（T001〜T009） — Stripe/Sanity準備・DBマイグレーション・ドメイン層・重複解消（分割不可のため一つにまとめる。PR説明に理由を明記する）
2. PR2: Phase 3（T010〜T012） — 会員登録
3. PR3: Phase 4（T013〜T016） — カタログ
4. PR4: Phase 5（T017〜T018） — 上限チェック
5. PR5: Phase 6（T019〜T020） — 注文スナップショット（差分が小さい場合はPR4と合流も検討）
6. PR6: Phase 7（T021〜T025） — 検証・ドキュメント更新・フォローアップ起票

## Implementation Strategy

### MVP First

Phase 1 → Phase 2 → Phase 3（US1: 登録）で一旦止めて検証。ただし本featureは「既存体験が壊れないこと」の保証が目的のため、US1のみのリリースでは不十分。US1〜US4すべてが揃って初めて移行完了と言える。

### Incremental Delivery

Phase 2完了後、US1〜US4を順不同で並行して進められる（それぞれ独立したファイルのため）。全て完了後にPhase 7で最終検証する。
