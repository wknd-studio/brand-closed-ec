# Implementation Plan: デザインシステム基盤の導入

**Branch**: `feature/design-system-foundation` | **Date**: 2026-08-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/005-design-system-foundation/spec.md`

## Summary

商用ECサービスとして今後も継続的にUI/UXを改善していくための土台として、(1) 既存の`globals.css`にセマンティックカラートークンを追加、(2) `class-variance-authority`ベースのプリミティブコンポーネント5種（Button/Input/Checkbox/Radio/Select）を`src/components/ui/`に実装、(3) Storybookを導入してログイン等の業務フローなしに単体確認できるようにする。既存画面への適用は行わず、既存のPlaywright E2Eテスト（`getByRole`/`name`属性ベース）に影響を与えないことを最優先の制約とする。

## Technical Context

**Language/Version**: TypeScript 5 (strict) / React 19 / Next.js 16 App Router（既存プロジェクトと共通）

**Primary Dependencies**: Tailwind CSS v4（既存）、`class-variance-authority`・`clsx`（新規追加）、Storybook（Next.js frameworkプリセット、新規追加、ローカル専用）

**Storage**: N/A（永続化データなし）

**Testing**: Vitest（コンポーネントに条件分岐等のロジックがある場合のみユニットテスト）、既存Playwright E2E（無変更で通ることを確認）。Storybook自体は自動テスト対象としない（目視確認ツールとして導入）

**Target Platform**: Web（アプリ本体はCloudflare Pages/Workers。Storybookはローカル開発環境限定、デプロイしない）

**Project Type**: 既存Next.js単一プロジェクト内への追加（新規パッケージ化はしない）

**Performance Goals**: SC-001（Storybook起動から10秒以内に全状態を確認できる）以外に特筆すべき性能要件なし

**Constraints**: 既存のE2Eテストが依存する`getByRole`/`name`属性/`name`属性セレクタを壊さないこと（FR-004, FR-006）。Storybook関連の依存・設定はアプリ本体のビルド・テスト対象から独立していること

**Scale/Scope**: プリミティブコンポーネント5種 × 状態4種前後、トークン追加は既存`@theme inline`ブロックへの追記のみ

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **原則I（CLAUDE.mdが正）**: ブランチは`git fetch origin develop`起点で作成済み（`feature/design-system-foundation`、worktree分離）。PRは差分200行/5ファイル目安で分割し、`speckit-tasks`でその単位に分解する → **PASS**
- **原則II（受け入れ条件の明記）**: spec.mdの各User Storyに「開発者が確認できること」「システムが保証すること」の2区分で受け入れ条件を明記済み（本フィーチャーの主体は会員・運営者ではなく開発者のため、原則の趣旨を踏襲し主体を読み替えた） → **PASS**
- **原則III（曖昧さの解消が計画より先）**: spec.md作成時点で`[NEEDS CLARIFICATION]`は残さず、スコープに影響する前提（既存見た目を踏襲しない等）はAssumptionsに明記しユーザーに確認済み → **PASS**
- **原則IV（実装記述と仕様意図の区別）**: 本フィーチャーは新規追加のみで既存ドキュメントの書き換えを伴わない → **N/A**
- **原則V（事実の単一情報源化）**: トークン定義は既存`globals.css`の`@theme inline`に一元化し、新規ファイルを作らない方針をresearch.mdで確定 → **PASS**

再評価（Phase 1設計後）: data-model.md/contracts/でトークン・コンポーネントProps・既存E2E互換性のルールを明文化した上でも、上記の判定に変更なし。**Constitution Check: PASS**

## Project Structure

### Documentation (this feature)

```text
specs/005-design-system-foundation/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── ui-components.md
└── tasks.md              # Phase 2 output (/speckit-tasks, 未作成)
```

### Source Code (repository root)

```text
src/
├── app/
│   └── globals.css              # 既存。@theme inlineブロックにセマンティックカラートークンを追記
├── components/
│   ├── ui/                      # 新規: プリミティブコンポーネント
│   │   ├── button.tsx
│   │   ├── button.stories.tsx
│   │   ├── input.tsx
│   │   ├── input.stories.tsx
│   │   ├── checkbox.tsx
│   │   ├── checkbox.stories.tsx
│   │   ├── radio.tsx
│   │   ├── radio.stories.tsx
│   │   ├── select.tsx
│   │   └── select.stories.tsx
│   └── (既存の header.tsx 等はスコープ外・変更しない)
└── lib/
    └── cn.ts                    # 新規: clsxラッパー（クラス名結合ユーティリティ）

.storybook/                       # 新規: Storybook設定
├── main.ts
└── preview.ts

tests/unit/ui/                    # 新規: プリミティブコンポーネントのユニットテスト（ロジックを持つものがあれば）
```

**Structure Decision**: 既存のNext.js単一プロジェクト構成をそのまま踏襲し、`src/components/ui/`を新設してプリミティブコンポーネントを集約する。Storybookは`.storybook/`にアプリ本体と分離した設定を置き、`tests/unit/`・`tests/e2e/`のincludeパターン（それぞれ`tests/unit/**/*.test.{ts,tsx}`・`./tests/e2e`）には元々`*.stories.tsx`が含まれないため、追加の除外設定は不要（research.md #4で確認済み）。

## Complexity Tracking

_Constitution Checkに違反なし。このセクションは該当なし。_
