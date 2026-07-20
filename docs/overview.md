# 全体像インデックス

このドキュメントは「今このサービスがどうなっているか」を把握するための薄い索引。事実そのものは書かず、トピックごとに**今その内容を正しく記述している場所**へのリンクだけを持つ。

**更新ルール**: あるトピックについて `specs/NNN-topic/` で新しい変更が行われたら、そのトピックの行を最新の `specs/NNN-topic/spec.md` に張り替える。事実の書き写しはしない（`docs/spec-driven-workflow.md` の設計原則参照）。

---

## トピック索引

| トピック                                                                     | 現在の正                                                                                        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| サービス概要・利用者・招待システム・ランク変更・退会・禁止事項・運営者ロール | [`docs/archive/service-spec.md`](./archive/service-spec.md)（凍結済みスナップショット）         |
| 会員プラン（7ランクモデル）                                                  | [`specs/001-seven-rank-pricing/spec.md`](../specs/001-seven-rank-pricing/spec.md)               |
| 各機能のユーザーストーリー・受け入れ条件                                     | [`docs/archive/user-stories.md`](./archive/user-stories.md)（凍結済みスナップショット）         |
| データモデル（エンティティ定義）                                             | [`docs/archive/data-model.md`](./archive/data-model.md)（凍結済みスナップショット）             |
| 注文・決済フロー（Checkout / Invoice）                                       | [`docs/archive/order-flow.md`](./archive/order-flow.md)（凍結済みスナップショット）             |
| 注文対応オペレーション                                                       | [`docs/archive/operations-order.md`](./archive/operations-order.md)（凍結済みスナップショット） |

---

## 横断的な参照資料（トピックに紐づかない）

- [`glossary.md`](./glossary.md) — 用語集
- [`product-vision.md`](./product-vision.md) — プロダクトビジョン
- [`definition-of-done.md`](./definition-of-done.md) — 完了の定義
- [`collaboration.md`](./collaboration.md) — 協業ガイド
- [`adr/`](./adr/) — 技術決定record
- [`spec-driven-workflow.md`](./spec-driven-workflow.md) — このドキュメント自体の運用ルール（仕様駆動開発ワークフロー設計）
