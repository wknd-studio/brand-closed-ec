# Tasks: デザインシステム基盤の導入

**Input**: Design documents from `/specs/005-design-system-foundation/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/ui-components.md, quickstart.md

**Tests**: CLAUDE.mdのテスト自動選択ルールに従い、「純粋な計算・バリデーション関数」に該当する箇所（variantのクラス名解決・エラー状態判定等）のみユニットテストを書く。見た目・レイアウトそのものはテスト対象外（Storybookでの目視確認に委ねる）。

**Organization**: Tasks are grouped by user story (spec.mdのUser Story 1〜3に対応)。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1/US2/US3)

## Path Conventions

Single project構成（`src/`, `tests/`）。plan.mdのProject Structureに準拠。

---

## Phase 1: Setup

**Purpose**: 新規依存関係の導入と共通ユーティリティの準備

- [ ] T001 `class-variance-authority`と`clsx`を依存関係に追加する（`package.json`, `pnpm add class-variance-authority clsx`）
- [ ] T002 [P] クラス名結合ユーティリティ`cn`を`src/lib/cn.ts`に実装する

**Checkpoint**: 依存関係とユーティリティが揃い、以降のUser Storyに着手できる

---

## Phase 2: Foundational

**Purpose**: このフィーチャーには全User Storyを跨ぐブロッキングな基盤タスクはない（Setupで十分）

_該当タスクなし。Phase 1完了後、直ちにUser Story 1に着手できる_

---

## Phase 3: User Story 1 - デザイントークンの一元管理 (Priority: P1) 🎯 MVP

**Goal**: 色のデザイントークンを`globals.css`に一元定義し、新規UI要素がトークン参照だけで統一感のある見た目にできる状態にする

**Independent Test**: 既存画面のボタン等いずれか1箇所をトークン参照に置き換え、見た目が変わらないこと・トークン変更が反映されることを確認する（spec.md US1）

### Implementation for User Story 1

- [ ] T003 [US1] `src/app/globals.css`の`@theme inline`にneutral階調カラートークン（`--color-neutral-50`〜`900`）を追加する
- [ ] T004 [US1] `src/app/globals.css`の`@theme inline`にセマンティックカラートークン（`--color-primary`/`--color-secondary`/`--color-success`/`--color-warning`/`--color-danger`）を追加する（既存の`--color-brand-*`と名前が衝突しないことを確認する。data-model.md参照）
- [ ] T005 [US1] `pnpm dev`で既存画面（例: `/shop`）を確認し、トークン追加前後で見た目に差異がないことを目視確認する（quickstart.md US1手順）

**Checkpoint**: デザイントークンが単一箇所に定義され、以降のプリミティブコンポーネントから参照可能な状態

---

## Phase 4: User Story 2 - プリミティブコンポーネントの実装 (Priority: P2)

**Goal**: User Story 1のトークンのみを参照する、再利用可能な5種類のプリミティブコンポーネントを実装する

**Independent Test**: ボタン・テキスト入力・チェックボックスのいずれか1種類を実装し、簡単なフォームを組み立てて意図した見た目・状態になることを確認する（spec.md US2）

**Depends on**: Phase 3（User Story 1のトークンを参照するため）

### Tests for User Story 2

> 対象はcontracts/ui-components.mdのProps契約のうち、純粋な計算・状態判定ロジックのみ（見た目そのものは対象外）

- [ ] T006 [P] [US2] Button variantのクラス名解決（`variant`×`disabled`の組み合わせ）に対するユニットテストを`tests/unit/ui/button.test.ts`に書く（先に失敗を確認する）
- [ ] T007 [P] [US2] Input/Selectの`error`指定時に`aria-invalid`が付与されるロジックに対するユニットテストを`tests/unit/ui/input.test.ts`に書く（先に失敗を確認する）

### Implementation for User Story 2

- [ ] T008 [P] [US2] `src/lib/cn.ts`と`class-variance-authority`を使い、Buttonのvariant定義（`buttonVariants`）と本体を`src/components/ui/button.tsx`に実装する（contracts/ui-components.md準拠。T006を通す）
- [ ] T009 [P] [US2] Inputコンポーネントを`src/components/ui/input.tsx`に実装する（`name`属性の透過、`error`時の`aria-invalid`。T007を通す）
- [ ] T010 [P] [US2] Checkboxコンポーネントを`src/components/ui/checkbox.tsx`に実装する（`label`と`aria-label`/`htmlFor`の関連付けを含む）
- [ ] T011 [P] [US2] Radioコンポーネントを`src/components/ui/radio.tsx`に実装する（`label`と`aria-label`/`htmlFor`の関連付けを含む）
- [ ] T012 [P] [US2] Selectコンポーネントを`src/components/ui/select.tsx`に実装する（`name`属性の透過、`error`時の`aria-invalid`）
- [ ] T013 [US2] `pnpm test`で全ユニットテストが通ること、`pnpm test:e2e`が既存結果のまま通ることを確認する

**Checkpoint**: 5種類のプリミティブコンポーネントが実装され、単体テスト・既存E2Eともにグリーン

---

## Phase 5: User Story 3 - Storybookによる開発・確認基盤 (Priority: P3)

**Goal**: 業務フローを経由せずプリミティブコンポーネントを単体確認できるStorybook環境を整備する

**Independent Test**: プリミティブコンポーネント1つにstoryを作成し、`pnpm storybook`でその全状態をブラウザから確認できることを確認する（spec.md US3）

**Depends on**: Phase 4（storyの対象となるコンポーネントが必要）

### Implementation for User Story 3

- [ ] T014 [US3] Storybook（Next.js frameworkプリセット）を導入し、`.storybook/main.ts`・`.storybook/preview.ts`を作成する
- [ ] T015 [P] [US3] `src/components/ui/button.stories.tsx`にButtonの全状態（variant×disabled等）のstoryを作成する
- [ ] T016 [P] [US3] `src/components/ui/input.stories.tsx`にInputの全状態（default/focus/disabled/error）のstoryを作成する
- [ ] T017 [P] [US3] `src/components/ui/checkbox.stories.tsx`にCheckboxの全状態のstoryを作成する
- [ ] T018 [P] [US3] `src/components/ui/radio.stories.tsx`にRadioの全状態のstoryを作成する
- [ ] T019 [P] [US3] `src/components/ui/select.stories.tsx`にSelectの全状態のstoryを作成する
- [ ] T020 [US3] `pnpm build`・`pnpm test`・`pnpm test:e2e`を実行し、Storybook導入がアプリ本体のビルド・テストに影響していないことを確認する（research.md #4）

**Checkpoint**: 全User Storyが独立して機能する。ログイン等を経由せず全プリミティブコンポーネントを確認できる

---

## Phase 6: Polish & Cross-Cutting Concerns

- [ ] T021 [P] `pnpm typecheck`・`pnpm lint`を新規ファイル全体に対して実行し、エラーを解消する
- [ ] T022 quickstart.mdの検証手順を通しで実行し、完了の目安を満たすことを確認する

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: 依存なし。即着手可能
- **Foundational (Phase 2)**: 該当タスクなし
- **User Story 1 (Phase 3)**: Setup完了後に着手可能
- **User Story 2 (Phase 4)**: User Story 1完了後に着手（トークンを参照するため）
- **User Story 3 (Phase 5)**: User Story 2完了後に着手（storyの対象コンポーネントが必要なため）
- **Polish (Phase 6)**: 全User Story完了後

### Parallel Opportunities

- T001とT002は並行可能
- T006・T007（テスト）は並行可能
- T008〜T012（5コンポーネントの実装）はそれぞれ別ファイルのため並行可能（ただしT008はT006、T009はT007を先に通しておく）
- T015〜T019（story作成）は並行可能

---

## Parallel Example: User Story 2

```bash
# コンポーネント実装を並行して進める場合
Task: "Implement Button component in src/components/ui/button.tsx"
Task: "Implement Checkbox component in src/components/ui/checkbox.tsx"
Task: "Implement Radio component in src/components/ui/radio.tsx"
Task: "Implement Select component in src/components/ui/select.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1（Setup）を完了する
2. Phase 3（User Story 1: トークン）を完了する
3. 既存画面の見た目に影響がないことを確認する
4. ここでPR化・レビュー可能（MVP）

### Incremental Delivery / PRサイズ（CLAUDE.md準拠、差分200行・5ファイル目安）

このフィーチャーは1 User Story = 1 PRでは収まらない見込みのため、以下の単位でPRを分割する。

1. **PR1**: Phase 1（Setup） + Phase 3（User Story 1: トークン） — 差分小、独立してレビュー・デプロイ可能
2. **PR2**: Phase 4（User Story 2）のうち T006〜T009（Button, Input + テスト） — 2コンポーネント分
3. **PR3**: Phase 4（User Story 2）のうち T010〜T013（Checkbox, Radio, Select） — 3コンポーネント分
4. **PR4**: Phase 5（User Story 3: Storybook基盤 + 全story） — Storybook設定自体がまとまった変更のため1PR
5. **PR5**: Phase 6（Polish） — 必要であれば直前のPRに含めてもよい

各PRは独立してマージ可能（前のPRがマージされていることが前提）。実際の分割はタスク実施時の差分量を見ながら調整してよい。

---

## Notes

- [P] tasks = different files, no dependencies
- 各タスク完了ごとにコミットする（CLAUDE.mdのコミット形式: `feat(scope): BRAND-XX 説明`。Linear issue番号は`/tasks-to-linear`実行後に確定する）
- 実装前にテストを書き、失敗を確認してから実装に進む（CLAUDE.mdの実装順序に準拠）
- Storybookの見た目そのもの・レイアウトはテスト不要（CLAUDE.mdのテスト自動選択ルール）
