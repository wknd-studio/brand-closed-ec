# knip（デッドコードの検出）

使われなくなったファイル・export・依存（デッドコード）を [knip](https://knip.dev/) で検出する（#683）。設定は `knip.jsonc`。

## 実行のしかた

```bash
pnpm knip              # 普通のモード（テストも入口に含める）
pnpm knip:production   # production モード（テストのファイルを入口から外す）
```

どちらも検出が1件でもあれば失敗する。CI の `Knip` ジョブ（`.github/workflows/deploy.yml`。PR と develop への push で動く）と `task check` で、両方のモードを実行する。

- **普通のモード**: どこからも使われていないファイル・export・型・依存（`package.json`）と、`package.json` に無いのに使っているコマンド・パッケージを検出する
- **production モード**: `src/` のうち、テストからしか使われていないファイル・export を検出する。TDD ではテストが呼び続けるため、普通のモードでは「使われている」と見えて残ってしまう本番のコードを見つけるためのもの。`dependencies` のうち本番のコードから使っていないものも検出する

knip は import・設定ファイルを静的にたどるだけで、実行時の呼び出しは見ない。消す前に、名前で読み込まれていないか（下記）を確かめる。

## 検出されたときの対応

1. **本当に使っていない**: 消す。テストからしか使っていない本番のコードは、テストの中へ移すか、テストごと消す
2. **名前で読み込まれる（誤検出）**: フレームワーク・道具がファイル名やパスで読み込むものは、import からはたどれない。`knip.jsonc` の `entry` に足し、なぜ入口なのかを1行のコメントで書く
   - Next.js（`page.tsx`・`layout.tsx`・`route.ts`・`middleware.ts`・`instrumentation.ts` 等）・Vitest・Playwright・Storybook・GitHub Actions・Taskfile・`package.json` の scripts から呼ばれるものは、knip のプラグインが自動で入口にするので足さなくてよい
   - `pnpm tsx scripts/...` で実行する新しいスクリプトは、Taskfile・ワークフロー・`package.json` のどれかから呼べば自動で入口になる。手元でしか実行しないものは `entry` に足す（`scripts/*.ts`・`scripts/product-import/*.ts` は足し済み）
   - production モードでも入口にするもの（本番で動く・`src/` を使うもの）は、末尾に `!` を付ける
3. **消すには判断が要る**: 消すと振る舞いが変わる恐れがあるもの・方針の判断が要るものは、消さずに無視のリストに入れ、理由を1行のコメントで書く
   - 特定のファイルの export・型だけを無視する: `ignoreIssues`（ファイルごとに `["exports"]` 等）
   - production モードだけで外す（テスト・Storybook からは使っているもの）: `project` に `"!<パス>!"` を足す。普通のモードでは引き続き検査される
   - `package.json` に入れない、OS に入れて使うコマンド: `ignoreBinaries`

無視のリストに入れたものは、消すかどうかを決めた時点で外す。

## 設定の要点

- `ignoreExportsUsedInFile: true`: 同じファイルの中で使っていて、テストのためにも export している関数・定数は報告しない（テストのためだけの export を production モードで誤検出にしないため）。どこからも使っていない export は報告される
- `sanity: false`: Sanity のプラグインは `sanity.config.ts` を設定ファイル扱いにして production モードの入口から外すため、プラグインを切って `entry` に書いている
- `project` の末尾に `!` が付いた `src/` だけが production モードの対象。`scripts/`・`tests/`・ルートの設定ファイルは普通のモードでだけ検査する

## 検出しないもの

- **クラスの未使用のメソッド**: knip v6 で `classMembers` の検出が廃止された（TypeScript の言語サービスに依存していたため。<https://knip.dev/blog/knip-v6>）
- **export していない未使用の変数・関数**: ESLint の担当
