# Contract: オンデマンド実行トリガーAPI

Sanity Studioの「今すぐ実行」ボタン（`on-demand-trigger-button.tsx`）から呼び出される、GitHub Actionsの`workflow_dispatch`を起動するためのプロキシエンドポイント。

## エンドポイント

```
POST /api/admin/product-import/trigger
```

### リクエストヘッダー

| ヘッダー                 | 説明                                                                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Product-Import-Token` | Studio専用のスコープ限定シークレット。このエンドポイントを呼ぶ権限のみを持つ（research.md #5参照）。GitHubへの直接アクセス権は含まない |

### リクエストボディ

```json
{
  "vendorId": "vendor-b"
}
```

### レスポンス

- `202 Accepted`: GitHub Actionsへのディスパッチ要求を受け付けた（実行自体は非同期。完了後の結果は`ProductImportRun`ドキュメントとしてSanity上に記録され、Studio側はそれをポーリング・購読して表示する）
- `401 Unauthorized`: トークン不正
- `400 Bad Request`: `vendorId`が存在しない、または対象業者の`data_source_type`が`scraping`でない

### 内部処理

1. `X-Product-Import-Token`を検証する
2. `vendorId`に対応する`vendor`ドキュメントをSanityから取得し、`data_source_type === "scraping"`かつ`is_contracted === true`であることを確認する（FR-009のガードをAPI層でも二重に効かせる）
3. GitHub REST API（`POST /repos/{owner}/{repo}/actions/workflows/product-data-sync.yml/dispatches`）を、サーバーサイドにのみ保持するGitHub PATを使って呼び出す。`inputs`に`vendorId`と`triggeredBy: "on_demand"`を渡す
4. `run-on-demand.ts`（GitHub Actions側）が`vendorId`を受け取り、該当業者のみを対象にスクレイピング→検証プレビュー→（担当者確認後）書き込みを実行する

### 検証プレビューとの関係

このAPI自体は「実行を開始する」ことだけを担い、検証プレビュー（FR-022）はGitHub Actions側の実行結果として`ProductImportRun`に記録され、Studio側でプレビュー相当の内容（成功見込み・エラー見込み）を確認した上で、担当者が別途「反映を確定する」操作を行う2段階のフローになる。CSVインポート（User Story 1）が同一プロセス内で完結するプレビュー→確定なのに対し、オンデマンド実行はプロセスが非同期に分かれる点が異なる。この非同期プレビュー確定フローの具体的なUI・API設計は`/speckit-tasks`でのタスク分割時に詳細化する。
