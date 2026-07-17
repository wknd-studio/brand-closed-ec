# Phase 1 Data Model: プラン変更（アップグレード・ダウングレード）

## 既存エンティティへの変更

### `User`（`src/domain/entities/user.ts`）

現行の `UserProps` に以下を追加する。

| フィールド                     | 型                   | 説明                                                                                              |
| ------------------------------ | -------------------- | ------------------------------------------------------------------------------------------------- |
| `billingAnchorDay`             | `number \| null`     | 請求期間の起点日（1〜28）。`subscribedAt` を段階的に置き換える（`docs/plan-change-flow.md` 参照） |
| `pendingRank`                  | `MemberRank \| null` | ダウングレード予約中のみ値を持つ。期末に適用予定のランク                                          |
| `stripeSubscriptionScheduleId` | `string \| null`     | ダウングレード予約中のみ値を持つ                                                                  |
| `initialFeePaidRank`           | `MemberRank \| null` | 支払い済み最高ランク。退会後も保持する                                                            |

追加するメソッド:

- `hasPendingDowngrade(): boolean` — `pendingRank !== null`
- `getMonthlyPeriod()` は将来的に `billingAnchorDay` 基準に置き換える（既存の `subscribedAt` 基準からの移行はDBマイグレーション込みで別タスクとする）

### `MemberRank`（`src/domain/value-objects/member-rank.ts`）

7ランク移行後の値を前提とする（本feature側での変更なし。依存specの成果物を参照する）。

## 新規の概念: プラン変更予約（Pending Plan Change）

DBの新規テーブルは作らず、`users` テーブルへのカラム追加（`pending_rank` / `stripe_subscription_schedule_id`）で表現する。会員1人につき同時に有効な予約は最大1件。

**状態遷移**:

```text
予約なし
  → [ダウングレード申請] → 予約あり（pendingRank = 申請先ランク）
予約あり
  → [別プランへ再申請]     → 予約あり（pendingRank を上書き）
  → [現プランに戻す申請]   → 予約なし（CANCEL_PENDING）
  → [期末到達（Stripe Webhook）] → 予約なし・rank = pendingRank
```

## DBスキーマ変更（`users` テーブル）

```sql
ALTER TABLE users
  ADD COLUMN billing_anchor_day SMALLINT CHECK (billing_anchor_day BETWEEN 1 AND 28),
  ADD COLUMN stripe_subscription_schedule_id TEXT,
  ADD COLUMN pending_rank TEXT,
  ADD COLUMN initial_fee_paid_rank TEXT;

-- 既存データのバックフィル（既存会員のsubscribed_atから算出）
UPDATE users
SET billing_anchor_day = LEAST(EXTRACT(DAY FROM subscribed_at)::SMALLINT, 28)
WHERE subscribed_at IS NOT NULL;
```

RLSポリシー: 既存の `users` テーブルのRLSポリシーに新規カラムを追加するだけで、ポリシー自体の変更は不要（会員は自分の行のみ参照・Server Action経由でのみ更新の方針を維持）。

## Repository / Gateway 変更

### `SubscriptionGateway`（`src/repositories/subscription-gateway.ts`）

既存: `cancelSubscription(subscriptionId: string): Promise<void>` のみ。

追加が必要なメソッド:

```ts
export interface SubscriptionGateway {
  cancelSubscription(subscriptionId: string): Promise<void>;
  upgradeSubscription(params: {
    subscriptionId: string;
    subscriptionItemId: string;
    newPriceId: string;
  }): Promise<void>;
  scheduleDowngrade(params: {
    subscriptionId: string;
    currentPriceId: string;
    newPriceId: string;
    existingScheduleId: string | null;
  }): Promise<{ scheduleId: string }>;
  releaseSchedule(scheduleId: string): Promise<void>;
}
```

### `UserRepository`

変更不要。既存の `save(user: User): Promise<void>` が新フィールドも含めて保存する前提（実装側でSupabase repositoryのマッピングを更新する）。
