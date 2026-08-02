# Tasks: 商品別支払いタイミング設定とカート分割注文

**Input**: Design documents from `/specs/004-split-order-payment-timing/`

**Prerequisites**: [plan.md](./plan.md)（必須）, [spec.md](./spec.md)（必須）, [research.md](./research.md), [data-model.md](./data-model.md), [contracts/internal-interfaces.md](./contracts/internal-interfaces.md), [quickstart.md](./quickstart.md)

**Tests**: CLAUDE.mdのテスト自動選択ルールに従い、全フェーズでテストタスクを含める（本プロジェクトでは省略しない）。

**Organization**: タスクはUser Story単位でグループ化し、各Storyが独立して実装・検証できるようにする。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 並列実行可能（別ファイル・依存関係なし）
- **[Story]**: 対応するUser Story（US1〜US5）
- 各タスクに具体的なファイルパスを含める

---

## Phase 1: Setup

**Purpose**: 本機能は既存プロジェクトへの追加であり、新規依存関係・新規プロジェクト構成は不要（research.mdの通り、既存レイヤードアーキテクチャをそのまま踏襲する）。

- [ ] T001 ローカル開発環境（`supabase start`・`task sanity:dev`）が起動しており、`git fetch origin develop`済みの最新developから本フィーチャーブランチが切られていることを確認する

---

## Phase 2: Foundational（US2・US4共通の前提）

**Purpose**: チェックアウト分割によって生成されるOrder同士を関連付けるためのデータ基盤。US2（分割してOrderを作成する）・US4（関連注文を表示する）の両方が依存するため、両Storyの実装より前に完了させる。

**⚠️ CRITICAL**: このフェーズが終わるまでUS2・US4の実装には着手できない（US1・US3はこのフェーズに依存しないため並行着手可）

- [x] T002 [P] Supabaseマイグレーション: `orders`テーブルに`split_group_id UUID`（nullable）列と部分インデックスを追加する新規ファイルを`supabase/migrations/<timestamp>_add_split_group_id_to_orders.sql`に作成（data-model.md参照）
- [x] T003 [P] `Order`エンティティに`splitGroupId: string | null`を追加 in `src/domain/entities/order.ts`（`OrderProps`・コンストラクタ・`toProps()`・`with()`を更新）
- [x] T004 [P] `OrderRepository`インターフェースに`findBySplitGroupId(splitGroupId: string): Promise<Order[]>`と`delete(orderId: string): Promise<void>`を追加 in `src/repositories/order-repository.ts`（contracts/internal-interfaces.md セクション6）
- [x] T005 `SupabaseOrderRepository`で`split_group_id`列の読み書き、`findBySplitGroupId`・`delete`を実装 in `src/infrastructure/supabase/supabase-order-repository.ts`（T002・T003・T004に依存）

**Checkpoint**: Order集約が分割注文の関連付けに対応した状態。US2・US4の実装に進める

---

## Phase 3: User Story 1 - 商品ごとに支払いタイミングを設定する (Priority: P1) 🎯 MVP起点

**Goal**: 運営者がSanity Studioで商品ごとに支払いタイミング（注文時払い/注文後払い）を設定できる。価格未確定商品は注文後払いに固定される。

**Independent Test**: 商品管理画面で任意の商品の支払いタイミングを「注文後払い」に変更し保存できること、価格未確定商品では変更できずランク別価格欄も非表示になることを確認するだけで、他Storyと無関係に検証できる。

### Tests for User Story 1

- [x] T006 [P] [US1] `validatePaymentTiming`（`is_negotiable=true`かつ`payment_timing=at_order`の矛盾を検出）のユニットテストを `tests/unit/sanity/product-payment-timing-validation.test.ts` に作成
- [x] T007 [P] [US1] `price_rates`・`prices`フィールドの`hidden`条件（`is_negotiable=true`で非表示）を検証するユニットテストを同ファイルに追加

### Implementation for User Story 1

- [x] T008 [US1] `payment_timing`フィールド（`at_order`/`after_order`、既定値`at_order`）と`validatePaymentTiming`を `src/sanity/schemas/product.ts` に実装（T006がFAILすることを確認してから実装）
- [x] T009 [US1] `price_rates`・`prices`フィールドに`hidden: ({document}) => document?.is_negotiable === true`を追加 in `src/sanity/schemas/product.ts`（T007がFAILすることを確認してから実装）

**Checkpoint**: Sanity Studio上で支払いタイミングを設定・保存できる。この時点でNext.js側は未対応のため、実際の注文フローにはまだ影響しない

---

## Phase 4: User Story 2 - 支払いタイミングが混在するカートをチェックアウトする (Priority: P1) 🎯 MVPコア

**Goal**: 会員がカートに両方の支払いタイミングの商品を入れて1回のチェックアウト操作をすると、システムが自動的にOrderを分割し、それぞれ既存のCheckout/Invoiceフローで処理する。

**Independent Test**: 先払い商品と後払い商品を1つずつカートに入れてチェックアウトし、Stripe Checkoutへのリダイレクトと、DB上に`split_group_id`を共有する2件のOrderが作成されることを確認する。単一タイミングのみのカートでは従来通り1件のみ作成されることも確認する。

### Tests for User Story 2

- [x] T010 [P] [US2] `splitCartByPaymentTiming`（カートを`at_order`/`after_order`の2グループに分割する純粋関数）のユニットテストを `tests/unit/order-flow-selector.test.ts` に作成（既存の`selectOrderFlow`テストを置き換え）
- [x] T011 [P] [US2] `place-order.ts`の分割ロジック（単一タイミング時は1件のみ作成という後方互換、混在時は2件作成し同一`splitGroupId`を持つこと、`redirectUrl`がCheckout優先で決定されること）のユニットテストを `tests/unit/use-cases/place-order.test.ts` に追加
- [x] T012 [P] [US2] 分割保存の原子性（Order Bの保存が失敗した場合、保存済みのOrder Aが削除されること）のユニットテストを同ファイルに追加（quickstart.md シナリオ7）
- [x] T013 [P] [US2] `paymentTiming`の分割判定がサーバー側`ProductSnapshot`のみを根拠にすること（`PlaceOrderInput`に`paymentTiming`を含めても無視されること）を確認するユニットテストを同ファイルに追加（research.md 決定9）
- [x] T014 [US2] 実Supabaseで2件のOrderが`split_group_id`付きで作成されることを検証する統合テストを `tests/integration/use-cases/place-order.test.ts` に追加

### Implementation for User Story 2

- [x] T015 [P] [US2] `ProductSnapshot`に`paymentTiming`を追加 in `src/repositories/product-repository.ts`、GROQ射影に含める in `src/infrastructure/sanity/sanity-product-repository.ts`
- [x] T016 [P] [US2] `CartItem`値オブジェクトに`paymentTiming`を追加 in `src/domain/value-objects/cart-item.ts`
- [x] T017 [US2] `src/domain/services/order-flow-selector.ts`の`selectOrderFlow`を`splitCartByPaymentTiming`に置き換え（T010・T016に依存）
- [x] T018 [US2] `place-order.ts`を書き換え: 分割前の合算での月次上限チェック維持、カート分割、Order A/B構築、両方成功/両方不成立の原子性保証（`orderRepo.delete`使用）、`splitGroupId`発行、`redirectUrl`決定ロジックを実装 in `src/use-cases/place-order.ts`（T005・T011〜T017に依存）

**Checkpoint**: 混在カートのチェックアウトが分割注文として正しく機能する。この時点でMVPとして動作確認可能（カート画面のグループ表示・関連注文の可視化はまだ未実装）

---

## Phase 5: User Story 3 - カート画面で支払いタイミングごとに商品をグループ表示する (Priority: P1)

**Goal**: 会員がチェックアウトを実行する前に、カート画面で商品が支払いタイミングごとにグループ表示され、何がいつ支払われるか事前に把握できる。

**Independent Test**: 支払いタイミングの異なる商品をカートに追加し、チェックアウトを実行せずカートサイドバーを開くだけで、2グループに分かれて表示され、単一タイミングのみの場合はグループ表示が出ないことを確認する。

### Tests for User Story 3

- [x] T019 [P] [US3] カートアイテムを`paymentTiming`でグループ化する関数（両方非空の場合のみグループを返す）のユニットテストを `tests/unit/cart-payment-grouping.test.ts` に作成

### Implementation for User Story 3

- [x] T020 [P] [US3] クッキー保存`CartItem`型に`paymentTiming`を追加 in `src/lib/cart/types.ts`
- [x] T021 [US3] 商品詳細取得(`ProductDetail`/`fetchProductById`)に`payment_timing`を追加 in `src/lib/sanity/products.ts`
- [x] T022 [US3] カート追加時に`paymentTiming`をコピーする処理を実装 in `src/app/(member)/shop/[brand]/[id]/add-to-cart-button.tsx`（T020・T021に依存）
- [x] T023 [US3] カートアイテムのグループ化関数を実装 in `src/lib/cart/types.ts`（T019に依存、T019がFAILすることを確認してから実装）
- [x] T024 [US3] `cart-sidebar.tsx`でグループ見出し・小計を表示するUIを実装 in `src/components/cart-sidebar.tsx`（T020・T023に依存）
- [x] T025 [US3] チェックアウト画面（`src/app/(member)/order/checkout/`配下）でも同様のグループ表示を確認・実装（既存実装を調査した上でT023の関数を再利用）

**Checkpoint**: 会員はチェックアウト前にカート画面で分割の事実を把握できる。US1〜US3でP1の全Storyが完了

---

## Phase 6: User Story 4 - 分割された注文をひとつの取引として把握する (Priority: P2)

**Goal**: 運営者・会員が、分割によって生成された2件の注文が同一のチェックアウトに由来することを画面上で判別できる。

**Independent Test**: 分割チェックアウトを1回実行し、`/order/complete`画面・管理画面のいずれからも、もう一方の関連注文の存在と状態が確認できることを検証する。分割されていない通常注文では関連表示が出ないことも確認する。

### Tests for User Story 4

- [x] T026 [P] [US4] `/order/complete`ページが`splitGroupId`を介して関連注文を取得し状態を表示するロジックのユニットテスト（コンポーネント/データ取得部分）を作成

### Implementation for User Story 4

- [x] T027 [US4] `/order/complete`ページで、Order取得後に`splitGroupId`があれば`orderRepo.findBySplitGroupId`で関連注文を取得し状態を表示 in `src/app/(member)/order/complete/`配下（T005に依存）
- [x] T028 [US4] 管理画面の注文詳細ページで、関連注文へのリンク・案内を表示 in `src/app/admin/orders/[id]/`配下（T005に依存）
  - 付随修正: `OrderWithUser`に`splitGroupId`を追加（`findByIdWithUser`/`findActiveOrdersWithUser`のSELECT・マッピングを更新）
  - 付随バグ修正: Invoice発行フォームが「要相談商品が1件以上ある場合のみ」表示される条件になっており、固定価格×`after_order`のみの注文でInvoiceを発行する手段が存在しなかった問題を修正

**Checkpoint**: 分割注文が運営者・会員双方から追跡可能になる

---

## Phase 7: User Story 5 - 月間購入上限を超えるチェックアウトを防ぐ (Priority: P2)

**Goal**: カート全体（価格確定商品のみ）の合計が月間購入上限を超える場合、分割の有無に関わらずチェックアウト全体をブロックする。

**Independent Test**: 上限を超える金額になるよう注文時払い商品と注文後払い商品を組み合わせてチェックアウトを試み、両方の注文が作成されずにブロックされることを確認する。

### Tests for User Story 5

- [x] T029 [P] [US5] 分割対象のカートでも、分割前の合計で上限超過と判定されればOrderが1件も作成されないことを検証するユニットテストを `tests/unit/use-cases/place-order.test.ts` に追加

### Implementation for User Story 5

- [x] T030 [US5] `place-order.ts`内の`checkMonthlyLimit`呼び出しが分割処理より前に実行される順序になっていることを確認する（T018で実装済みのはずのため、本タスクはT029のテストが通ることの確認が中心。順序がずれていれば修正）
  - 確認結果: `checkMonthlyLimit`（分割前の合算判定）→`splitCartByPaymentTiming`の順序で既に正しく実装されており、修正不要だった

**Checkpoint**: 全5 User Storyが完了。分割チェックアウトの主要フローが一通り機能する

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: 手動検証・E2E網羅・デモデータ整備

- [x] T031 [P] `scripts/seed-products.ts`に`payment_timing`混在のデモ商品データを追加（既存のデザインテーマ・掛け率設定と同様のパターンで、動作確認用に数件アタッチする）
  - ReFa（美容家電、3商品）を`after_order`、GUCCI/LOEWE/HERMÈS/CHANEL（ハイブランド、10商品）を`at_order`に設定
- [x] T032 [P] 分割チェックアウトのE2Eテストを `tests/e2e/order/` 配下に追加（既存の`checkout.spec.ts`・`invoice.spec.ts`を参考に、quickstart.md シナリオ4相当を自動化）
  - `tests/e2e/order/split-checkout.spec.ts`を新規作成。テスト専用商品（at_order/after_order各1件）を作成し、両方カートに入れて注文確定→Stripe Checkoutへの遷移、同一`split_group_id`を持つ2件のOrder作成、チェックアウト画面のグループ表示を検証。ローカルで実行し2回連続成功を確認済み
- [x] T033 quickstart.mdの手動UI確認チェックリスト（Sanity Studio・カート表示・完了画面・管理画面）を実際のブラウザで実施
  - 実施済み: Playwright経由で実ブラウザ・実Doppler資格情報を使い、カートサイドバー・チェックアウト画面のグループ表示をスクリーンショットで確認（グループ見出し・小計とも明確に表示されることを確認）
  - 未実施: Sanity Studio商品編集画面のバリデーション表示、`/order/complete`のもう一方の注文案内（実際のStripe決済完了が必要でE2E自動化の対象外）、管理画面の注文一覧・詳細（管理者権限のテストユーザー未整備）。これらは手動での目視確認を推奨
- [x] T034 実装中に判明した仕様の差分があれば、PR作成直前にspec.md/plan.md/research.mdへ一度だけまとめて反映する（CLAUDE.mdのドキュメント更新頻度ルールに従う）
  - research.mdに決定10（`payment_timing`未設定の既存商品を`at_order`扱いにする後方互換の教訓）・決定11（Invoice発行フォームは要相談商品0件でも表示する）を追記

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし。即着手可
- **Foundational (Phase 2)**: Setup完了後。US2・US4をブロックする（US1・US3はブロックしない）
- **US1 (Phase 3)**: Foundationalと並行して着手可（依存なし）
- **US2 (Phase 4)**: Foundational（Phase 2）完了後。US1のSanityフィールドがあると望ましいが、US2自身の実装・テストはSanity側の値が存在しなくても`ProductSnapshot.paymentTiming`のモックで進行可能
- **US3 (Phase 5)**: US1のSanityフィールド追加（T008）に依存（実際の`payment_timing`値を読むため）。US2との技術的な依存はない
- **US4 (Phase 6)**: Foundational（Phase 2、特にT005の`findBySplitGroupId`）とUS2（分割してOrderを作る機能）に依存
- **US5 (Phase 7)**: US2（Phase 4）に依存（US2の実装が月次上限チェックの順序を含むため）
- **Polish (Phase 8)**: 全Storyの完了に依存

### Parallel Opportunities

- Phase 2内: T002・T003・T004は並列実行可（T005のみそれらに依存）
- Phase 3（US1）はPhase 2と並行して着手可能
- 各Phase内の[P]マーク付きテストタスクは並列実行可
- US1完了後、US2とUS3はそれぞれ独立して並行着手可能（US3はUS1のSanityフィールドにのみ依存し、US2の完了を待つ必要はない）

---

## Implementation Strategy

### MVP First

1. Phase 1: Setup
2. Phase 2: Foundational
3. Phase 3: US1（Sanityスキーマ）
4. Phase 4: US2（分割チェックアウトのコアロジック）
5. **この時点でMVP**: 混在カートが正しく2件のOrderに分割される。カート画面での事前表示（US3）・分割注文の関連付け表示（US4）はまだないが、機能としては動作する

### Incremental Delivery

1. Setup + Foundational → 基盤完成
2. US1 → Sanity Studioで支払いタイミングを設定可能に
3. US2 → 分割チェックアウトが機能（MVP）
4. US3 → 会員への事前可視化を追加（信頼性向上）
5. US4 → 運営者・会員への事後の関連付け表示を追加
6. US5 → 上限超過時の安全性をテストで担保
7. Polish → デモデータ・E2E・ドキュメント最終反映

各StoryはPRサイズ目安（差分200行・変更ファイル5つ以内、CLAUDE.md）に収まるよう、Phase単位で個別PRに分割することを推奨する。
