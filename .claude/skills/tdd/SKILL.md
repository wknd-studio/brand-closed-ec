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

**Step 2.5: テストだけをコミットする**

失敗を確認した状態のテストを、実装より先に1つのコミットにする（CLAUDE.md「コミット形式」）。どう失敗したか（失敗したテスト名と理由）を控え、PR本文の「実行したチェック」の「テストのコミットの時点で失敗していたこと」に書く。

```bash
git add <テストのファイル>
git commit -m "test(scope): BRAND-XX $ARGUMENTS の完了条件を確かめる"
```

- このコミットではテストが赤のままでよい（CIのテストはPRの先頭のコミットでだけ動く）。pre-commitのlint-staged（eslint・prettier）は通す
- Step 4 でテスト自体を直したら、テストの変更は実装と同じコミットに混ぜず、`test` のコミットとして分ける

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

**Step 6: 実装 → 生成物 → ドキュメントの順にコミットする**

Step 2.5 のテストのコミットに続けて、種類ごとに分けてコミットする（CLAUDE.md「コミット形式」）。該当しないコミットは作らなくてよい。

```bash
# 1. 実装（feat・fix・refactor）: 本番コードだけ
git add <本番コードのファイル>
git commit -m "feat(scope): BRAND-XX $ARGUMENTS"

# 2. 生成物・機械的な変更: 手作業の変更と混ぜず、実行したコマンドを最後の段落に trailer で書く
supabase gen types typescript --local > src/types/database.types.ts
git add src/types/database.types.ts
git commit -m "chore(types): BRAND-XX 型を再生成する" -m "Mechanical-Change: <コマンド>"
#   trailer に書けるのは CLAUDE.md「PR の粒度」の許可リストのコマンドだけ。
#   リダイレクト（>）を含む型の再生成のように書けないものは、trailer を付けずに専用のコミットにする

# 3. ドキュメント（spec.md・CLAUDE.md・docs/ 等）
git add <ドキュメントのファイル>
git commit -m "docs(scope): BRAND-XX $ARGUMENTS の仕様を反映する"
```

- レビュー指摘への対応は、この順に並べ直さず追加のコミットでよい

**Step 7: プッシュ・PR**

- 通常はユーザーの承認後にプッシュする。Orcaのワークツリーで担当issueを実装した場合は、CLAUDE.md「自動push・PR」の条件を満たせば承認を待たずにプッシュ・PR作成まで進めてよい

```bash
git push -u origin feature/BRAND-XX-xxx
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
