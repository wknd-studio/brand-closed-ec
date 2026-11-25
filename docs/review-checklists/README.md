# high-risk の確認観点

`high-risk` ラベルの付いたPRは、人間が差分を精読してからマージする（CLAUDE.md「PRのレビュー」）。区分ごとに見るべき観点が違うため、対象パスを区分（`risk:*` ラベル）に分け、区分ごとの確認観点を1区分1ファイルで置く。

`risk:db`・`risk:webhook`・`risk:auth`・`risk:payment` に当たるPRには必ず `high-risk` が付く。`risk:gate`・`risk:deps` は、ゲートを弱める変更・依存の追加とメジャー更新のときだけ `high-risk` が付く（判定は `scripts/ci/high-risk.ts`。#578）。`high-risk` が付かないPRでも、区分のチェックリストは PR Diff Summary に出る。

| ラベル         | 対象                                                         | 確認観点                 |
| -------------- | ------------------------------------------------------------ | ------------------------ |
| `risk:db`      | マイグレーション（スキーマ・RLS）                            | [db.md](db.md)           |
| `risk:webhook` | Stripe・ClerkのWebhook                                       | [webhook.md](webhook.md) |
| `risk:auth`    | ルート保護・ログインユーザーの取得・service roleクライアント | [auth.md](auth.md)       |
| `risk:payment` | 決済・注文・金額計算                                         | [payment.md](payment.md) |
| `risk:gate`    | CI・権限設定・lint・完了チェック                             | [gate.md](gate.md)       |
| `risk:deps`    | 依存の追加・更新                                             | [deps.md](deps.md)       |

## 仕組み

- 区分の対象パスは `.github/labeler.yml` だけに書く。`high-risk` は labeler.yml に書かず、Labeler ワークフローの high-risk ジョブが `scripts/ci/high-risk.ts` の判定で付け外しする
- PR Diff Summary のコメント（`scripts/ci/pr-diff-summary.ts`）に、PRが当たった区分ごとに「該当するファイル」と、各ファイルの `- [ ]` の行がチェックリストとして出る（`scripts/ci/review-checklists.ts`）
- ファイル名は `risk:` を除いたラベル名にする（`risk:db` → `db.md`）。最初の見出しがコメントの見出しになり、`- [ ] ` で始まる行だけがチェック項目になる。説明は `- [ ]` 以外の段落に書く
- レビューをすり抜けたバグが出たら、同じ観点の項目をここに足すか、lint・テストに変換する
