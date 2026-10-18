# TDD実装ワークフロー

$ARGUMENTSの実装をTDDで進める。

## 手順

**Step 1: 失敗するテストを書く**

- E2E（Playwright）: `tests/e2e/` 以下に `.spec.ts` を作成
- テストが「何を確認するか」をコメントで1行書いてから実装する
- 下記「守るテストの観点」を満たすように書く

**Step 2: テストが失敗することを確認する**

```bash
pnpm test:e2e
```

- 失敗しない場合はテストが間違っている → Step 1 に戻る
- 失敗の理由が「未実装だから」になっているか確認する（import エラーやテスト自体の書き間違いで落ちているだけなら Step 1 に戻る）
- 実装後（Step 4）に、実装を一時的に壊して（条件の反転・呼び出しの重複・エラー処理の削除など）テストが落ちることも確かめる。壊しても通るテストは守れていないので書き直す

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

## 守るテストの観点

カバレッジではなく、通るべき時に通り、失敗すべき時に失敗するテストを書く。CIが通ればマージされるPRが多いため、弱いテストはそのまま本番まで素通りする。

- **呼び出しは回数まで検証する**: `toHaveBeenCalled()` ではなく `toHaveBeenCalledTimes(1)` を使う（成功時のコールバックが2回呼ばれても通ってしまうテストにしない）。引数も `toHaveBeenCalledWith(...)` で確かめる
- **呼ばれてはいけないものが呼ばれないことを検証する**: エラー時に成功側の処理（DB書き込み・メール送信・決済確定など）が走らないことを `not.toHaveBeenCalled()` で確かめる
- **失敗ケースを最低1つ書く**: 正常系だけで終わらせず、失敗すべき入力（不正値・権限なし・重複・境界値の外側など）で失敗することを確かめる
- **実装を壊したら落ちることを確かめる**: Step 2・Step 4 の確認で、テストが実装の誤りを検出できることを確認する

```ts
// 悪い例: 2回呼ばれても、エラー時に成功処理が走っても通る
expect(onSuccess).toHaveBeenCalled()

// 良い例
expect(onSuccess).toHaveBeenCalledTimes(1)
expect(onSuccess).toHaveBeenCalledWith(expected)
expect(onError).not.toHaveBeenCalled()
```

## 例外

インフラ設定ファイル（Cloudflare設定、環境変数定義など）はテストより先に実装してよい。その旨をユーザーに明示すること。
