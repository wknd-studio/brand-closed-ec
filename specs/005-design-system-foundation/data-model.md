# Data Model: デザインシステム基盤の導入

このフィーチャーは永続化データを持たない（Supabase/DBへの変更なし）。ここでは spec.md の Key Entities を、実装上の構造として具体化する。

## デザイントークン

`src/app/globals.css` の `@theme inline` ブロックに追加するCSSカスタムプロパティ群。

| トークングループ | 命名                                                   | 例                                                                  |
| ----------------- | ------------------------------------------------------ | -------------------------------------------------------------------- |
| Neutral階調       | `--color-neutral-{50,100,...,900}`                      | ボーダー・背景・非活性テキスト等に使用                               |
| セマンティックカラー | `--color-primary` / `--color-danger` / `--color-success` / `--color-warning` | ボタン・バリデーションメッセージ等に使用                             |
| 既存ブランドトークン | `--color-brand-primary` / `--color-brand-accent`（変更しない） | 既存の`brand-theme-wrapper.tsx`が上書きする仕組みをそのまま維持      |
| タイポグラフィ    | Tailwind標準スケール（`text-sm`〜`text-3xl`等）をそのまま採用 | 独自の再定義はしない（research.md #1参照）                           |
| スペーシング      | Tailwind標準スケール（`p-1`〜`p-12`等）をそのまま採用   | 同上                                                                  |

**バリデーションルール**: 新しいセマンティックカラーは、既存の `--color-brand-*` 系トークンと名前が衝突してはならない。

## プリミティブコンポーネント

`src/components/ui/` 配下に配置する。各コンポーネントは以下の構造を持つ。

| コンポーネント | ファイル               | variant                          | state                                          |
| -------------- | ----------------------- | --------------------------------- | ----------------------------------------------- |
| Button         | `button.tsx`             | `primary` / `secondary` / `danger` | `default` / `hover` / `focus` / `disabled`       |
| Input          | `input.tsx`               | `default`                         | `default` / `focus` / `disabled` / `error`       |
| Checkbox       | `checkbox.tsx`             | `default`                         | `default` / `checked` / `disabled`               |
| Radio          | `radio.tsx`               | `default`                         | `default` / `checked` / `disabled`               |
| Select         | `select.tsx`               | `default`                         | `default` / `focus` / `disabled` / `error`       |

**バリデーションルール（FR-004準拠）**:
- Button → `<button>`要素、または`role="button"`
- Input / Select → ネイティブ`<input>`/`<select>`要素（`name`属性はコンポーネント利用側が指定できるようpropsで透過する。既存E2Eの`locator('input[name="..."]')`パターンと両立させるため）
- Checkbox / Radio → ネイティブ`<input type="checkbox">`/`<input type="radio">`（`getByRole("checkbox"|"radio", { name })`と両立させるため、`label`との関連付け（`htmlFor`/`id`または`aria-label`）を必須にする）

**状態遷移**: なし（プリミティブコンポーネントはpropsで状態を受け取るだけで、内部状態遷移ロジックを持たない。フォーム状態管理は呼び出し側の責務）

## Story

`src/components/ui/*.stories.tsx` として各プリミティブコンポーネントに併置。1コンポーネントにつき、`data-model.md`のstate一覧に対応するstoryを最低1つずつ用意する。
