# 全体像インデックス

このドキュメントは「今このサービスがどうなっているか」を把握するための薄い索引。事実そのものは書かず、トピックごとに**今その内容を正しく記述している場所**へのリンクだけを持つ。

**更新ルール**: あるトピックについて `specs/NNN-topic/` で新しい変更が行われたら、そのトピックの行を最新の `specs/NNN-topic/spec.md` に張り替える。事実の書き写しはしない（`docs/spec-driven-workflow.md` の設計原則参照）。

---

## トピック索引

| トピック                               | 現在の正                                                                  |
| -------------------------------------- | ------------------------------------------------------------------------- |
| 会員登録（招待制）・個人/法人・退会    | [`docs/domain/membership.md`](./domain/membership.md)                     |
| ランク・サブスクリプション・プラン変更 | [`docs/domain/subscription-billing.md`](./domain/subscription-billing.md) |
| 商品カタログ・ブランド・在庫           | [`docs/domain/catalog.md`](./domain/catalog.md)                           |
| カート・注文・Checkout / Invoice       | [`docs/domain/ordering.md`](./domain/ordering.md)                         |
| 発注管理                               | [`docs/domain/procurement.md`](./domain/procurement.md)                   |
| 配送・分割出荷                         | [`docs/domain/fulfillment.md`](./domain/fulfillment.md)                   |
| 返品・返金                             | [`docs/domain/returns.md`](./domain/returns.md)                           |
| 運営者権限管理                         | [`docs/domain/admin-rbac.md`](./domain/admin-rbac.md)                     |
| データモデル（テーブル定義）           | [`docs/db-schema-redesign.md`](./db-schema-redesign.md)                   |

---

## 横断的な参照資料（トピックに紐づかない）

- [`glossary.md`](./glossary.md) — 用語集
- [`product-vision.md`](./product-vision.md) — プロダクトビジョン
- [`definition-of-done.md`](./definition-of-done.md) — 完了の定義
- [`collaboration.md`](./collaboration.md) — 協業ガイド
- [`adr/`](./adr/) — 技術決定record
- [`spec-driven-workflow.md`](./spec-driven-workflow.md) — このドキュメント自体の運用ルール（仕様駆動開発ワークフロー設計）
- [`domain/README.md`](./domain/README.md) — ドメインドキュメント計画書（`docs/domain/*.md`の索引・執筆ルール）
