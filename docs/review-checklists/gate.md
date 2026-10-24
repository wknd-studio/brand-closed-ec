# ゲート（CI・権限設定・lint・完了チェック）

CI（`.github/`）・Claude Codeの権限設定（`.claude/settings.json`）・lint（`eslint.config.mjs`）・完了チェック（`Taskfile.yml`）・CIのスクリプト（`scripts/ci/`）の変更。ゲート自体が弱まると、以後のPRで問題がすり抜けても気づけない。

## 確認観点

- [ ] 必須チェックが動かなくなっていないか（ジョブ名・`on:` の条件・`if:` の変更で、必須のチェックがスキップされたり成功扱いになったりしないか）
- [ ] 失敗を見逃す書き方が無いか（`continue-on-error`・`|| true`・終了コードを捨てるパイプ・lintルールの無効化）
- [ ] 権限（`permissions:` が必要最小限か。PRのコードを実行するジョブに書き込み権限やシークレットを渡していないか。`pull_request_target` でPRのコードをcheckoutしていないか）
- [ ] 外部のActionsのバージョンの指定（信頼できる提供元か）
- [ ] `.claude/settings.json` で、確認なしに実行できるコマンドを広げすぎていないか
- [ ] 変更したゲートが、壊れた入力で実際に失敗することを確かめたか（テスト・意図的に失敗させたPR等）
