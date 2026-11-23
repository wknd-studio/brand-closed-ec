# PRの動作確認（人間が確かめる手順）

PRごとのプレビューURL（PRごとのデプロイ）は無い。クラウドのDBが stg と本番しか無いため、ローンチ前は作らない（2026-11-23に判断。issue #711）。代わりに、子セッションがPR本文の「動作確認の手順」に確かめ方を書き、人間はPRを開けば各ワークツリーのClaudeに聞かずに確かめられるようにする。

## PR本文の「動作確認の手順」

`.github/pull_request_template.md`（spec の PR は `PULL_REQUEST_TEMPLATE/spec-change.md`）の「レビューの要点」の直後にある。4つの項目を書く。

| 項目                   | 書くこと                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **手動確認**           | `要（マージ前）`・`要（stg）`・`不要` のどれか。`不要` は後ろに理由を1行（例: `不要（CIの設定だけ）`・`不要（ロジックはユニットテストで確認済み）`） |
| **準備**               | ブランチ名、`supabase db reset`・`task supabase:seed-users` 等が要るか、必要な Doppler の値や外部の設定（Stripe CLI 等）                             |
| **アカウント**         | `docs/seed-data.md`「テストアカウント」のメールアドレス（例: `info+test_admin1@wknd-studio.com`）。新規登録が要るならそう書く。パスワードは書かない  |
| **手順と期待する結果** | 「開くURLのパス → 操作 → 何が表示・変化すれば正しいか」を番号付きで。完了条件のうち人間が画面で確かめるべきものを含める                              |

`要（マージ前）` と `要（stg）` の分け方:

- `要（マージ前）`: `high-risk` のPR・画面が大きく変わるPR。マージの前に、メインのチェックアウトで確かめる
- `要（stg）`: それ以外で、人間が画面で確かめるべきものがあるPR。マージの後に stg でまとめて確かめる（ローンチ前で利用者がいないため）

CIの `PR Review Summary`（`scripts/ci/check-pr-review-summary.sh`）が、手動確認が空欄・3つの値以外・理由の無い `不要` のとき、また `要（…）` なのに準備・アカウント・手順と期待する結果のどれかが空欄のときに失敗する。Dependabot のPRは検査しない。

## needs-manual-check ラベル

手動確認が `要（マージ前）`・`要（stg）` のPRには、CI（`.github/workflows/pr-review-summary.yml` の `Manual Check Label`）が `needs-manual-check` ラベルを付ける。

- PRの作成時・再オープン時に付ける。本文の編集で `不要` に書き換えたら外し、`要` に書き換えたら付ける
- 本文を編集しても要・不要が変わらなければ、ラベルは動かさない（人間が外したラベルを、別の箇所の編集で付け直さない）。push でも動かさない
- 確かめ終わった人間が外す。レビュー対応の push の後にもう一度確かめたいときは、人間がラベルを付け直す
- fork のPR・Dependabot のPR・閉じたPRは対象外

## マージ前に確かめる（`要（マージ前）`）

ngrok・Stripe CLI はメインのチェックアウトの `task dev` にしか無いため（`docs/dev-parallel-worktrees.md`）、メインのチェックアウトで確かめる。

1. メインのチェックアウトで、PRの「準備」のブランチに切り替える: `git fetch origin && git switch <ブランチ>`
2. 「準備」に書かれた `supabase db reset`・`task supabase:seed-users` 等を実行する
3. `task dev` で起動し、ngrok のURL（`https://buffing-flaccid-nutty.ngrok-free.dev`）を開く
4. 「アカウント」のメールアドレスでログインし（パスワードは Doppler の `SEED_USER_PASSWORD`）、「手順と期待する結果」を順に確かめる
5. 確かめ終わったら `needs-manual-check` ラベルを外す（PRの画面の Labels から外す。CLIなら `gh api -X DELETE repos/{owner}/{repo}/issues/<PR番号>/labels/needs-manual-check`。`gh pr edit --remove-label` は Projects (classic) の廃止のエラーで失敗することがある）。問題があればPRにコメントする
6. メインのチェックアウトを `develop` に戻す: `git switch develop`

## stg で確かめる（`要（stg）`）

マージの後、その日にマージされたラベル付きのPRをまとめて確かめる。

1. マージ済みで未確認のPRを出す: `gh pr list --state merged --label needs-manual-check`
2. develop への push で動いた `Deploy (staging)` が終わっていることを確かめる
3. 1のPRを順に開き、stg（`https://brand-closed-ec-stg.white-night-bb71.workers.dev/`。`docs/collaboration.md`）で「アカウント」のメールアドレスでログインし（パスワードは同じ `SEED_USER_PASSWORD`）、「手順と期待する結果」を確かめる。stg では「準備」のうち DB の操作は要らない（マイグレーションは `Deploy (staging)` が適用する）
4. 確かめ終わったPRから `needs-manual-check` ラベルを外す（外し方はマージ前と同じ）。問題があれば修正のissueを起票する
