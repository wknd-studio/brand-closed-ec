# Quickstart: デザインシステム基盤の導入

## 前提

```bash
pnpm install
```

## US1: デザイントークンの確認

1. `src/app/globals.css` の `@theme inline` に追加したセマンティックカラートークンを確認する
2. `pnpm dev` でアプリを起動し、既存画面（例: `/shop`）の見た目が変わっていないことを確認する（トークン追加のみで既存の`--color-brand-*`・`--background`・`--foreground`は変更しないため）

## US2: プリミティブコンポーネントの確認

```bash
pnpm test              # tests/unit配下のコンポーネント単体テストが通ること
```

## US3: Storybookの確認

```bash
pnpm storybook          # ローカルでStorybookを起動
```

1. ブラウザで各プリミティブコンポーネント（Button/Input/Checkbox/Radio/Select）のstoryが表示されることを確認する
2. ログイン画面等を一切経由せずに、disabled・error等の各状態が確認できることを確認する

## 既存テストへの非影響確認（FR-006）

```bash
pnpm typecheck
pnpm lint
pnpm test               # 既存の単体・統合テストが全て通ること
pnpm test:e2e            # 既存のE2Eテストが全て通ること（getByRole/name属性ベースのため、変更の影響を受けないはず）
```

## 完了の目安

- `pnpm storybook`で5種類のプリミティブコンポーネント × 各4状態前後を業務フローなしで確認できる
- 上記いずれのコマンドも既存の結果から悪化しない
