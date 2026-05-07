# TDD実装ワークフロー

$ARGUMENTSの実装をTDDで進める。

## 手順

**Step 1: 失敗するテストを書く**

- E2E（Playwright）: `tests/e2e/` 以下に `.spec.ts` を作成
- テストが「何を確認するか」をコメントで1行書いてから実装する

**Step 2: テストが失敗することを確認する**

```bash
pnpm test:e2e
```

- 失敗しない場合はテストが間違っている → Step 1 に戻る

**Step 3: テストが通る最小限のコードを実装する**

- 余分な機能を先回りして追加しない

**Step 4: テストが通ることを確認する**

```bash
pnpm test:e2e
pnpm typecheck
pnpm lint
```

**Step 5: リファクタリング（必要な場合のみ）**

- テストが通ったままであることを確認しながら整理

**Step 6: ユーザーの承認を得てコミット**

```bash
git add <files>
git commit -m "feat(scope): BRAND-XX $ARGUMENTS"
```

**Step 7: プッシュ → Cloudflare Pages が自動デプロイ**

```bash
git push origin feature/BRAND-XX-xxx
```

## 例外

インフラ設定ファイル（Cloudflare設定、環境変数定義など）はテストより先に実装してよい。その旨をユーザーに明示すること。
