# high-risk の確認観点

`high-risk` ラベル（`.github/labeler.yml`）の付いたPRは、人間が差分を精読してからマージする（CLAUDE.md「PRのレビュー」）。区分ごとに見るべき観点が違うため、対象パスを区分（`risk:*` ラベル）に分け、区分ごとの確認観点を1区分1ファイルで置く。

| ラベル         | 対象                                                         | 確認観点                 |
| -------------- | ------------------------------------------------------------ | ------------------------ |
| `risk:db`      | マイグレーション（スキーマ・RLS）                            | [db.md](db.md)           |
| `risk:webhook` | Stripe・ClerkのWebhook                                       | [webhook.md](webhook.md) |
| `risk:auth`    | ルート保護・ログインユーザーの取得・service roleクライアント | [auth.md](auth.md)       |
| `risk:payment` | 決済・注文・金額計算                                         | [payment.md](payment.md) |
| `risk:gate`    | CI・権限設定・lint・完了チェック                             | [gate.md](gate.md)       |
| `risk:deps`    | 依存の追加・更新                                             | [deps.md](deps.md)       |

## 仕組み

- 区分の対象パスは `.github/labeler.yml` だけに書く。`high-risk` の対象パスは区分の和集合にする（`tests/unit/review-checklists.test.ts` が検査する）
- PR Diff Summary のコメント（`scripts/ci/pr-diff-summary.ts`）に、PRが当たった区分ごとに「該当するファイル」と、各ファイルの `- [ ]` の行がチェックリストとして出る（`scripts/ci/review-checklists.ts`）
- ファイル名は `risk:` を除いたラベル名にする（`risk:db` → `db.md`）。最初の見出しがコメントの見出しになり、`- [ ] ` で始まる行だけがチェック項目になる。説明は `- [ ]` 以外の段落に書く
- レビューをすり抜けたバグが出たら、同じ観点の項目をここに足すか、lint・テストに変換する
