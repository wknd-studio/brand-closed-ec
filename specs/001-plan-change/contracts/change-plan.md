# Contract: プラン変更

## Server Action: `changePlan`

`src/app/(member)/mypage/plan/actions.ts`（新規）から呼ばれる薄いアダプター。実体は `src/use-cases/change-plan.ts` のユースケースを呼ぶ。

```ts
type ChangePlanInput = {
  targetPlan: MemberRankValue;
};

type ChangePlanResult =
  | { type: "upgraded"; newRank: MemberRankValue }
  | { type: "downgrade_scheduled"; effectiveFrom: string /* ISO date */ }
  | { type: "pending_cancelled" }
  | { type: "no_op" }
  | { type: "error"; message: string };
```

**事前条件**: 呼び出し元で `auth()` により会員本人であることを確認済み。

**事後条件**:

- `upgraded`: `users.rank` が即時更新され、`users.billing_anchor_day` が当日にリセットされている
- `downgrade_scheduled`: `users.pending_rank` ・ `users.stripe_subscription_schedule_id` が設定され、`users.rank` は変更されない
- `pending_cancelled`: `users.pending_rank` ・ `users.stripe_subscription_schedule_id` が `null` に戻る

## Webhook: `customer.subscription.updated`

既存の `src/app/api/webhooks/stripe/route.ts` に分岐を追加する。

| 条件                                                    | 処理                                                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `event.data.object.schedule` が非null かつ 価格変化あり | 期末ダウングレードの確定。`users.rank = 新プラン`, `pending_rank = null`, `stripe_subscription_schedule_id = null` |
| `event.data.object.schedule` が null かつ 価格変化あり  | アップグレードの確認（`changePlan` 実行時に既にDB更新済みのため、原則no-op。整合性チェックのみ行う）               |
| 価格変化なし                                            | 通常のrenewal。何もしない                                                                                          |

## Webhook: `subscription_schedule.released`

`users.stripe_subscription_schedule_id = null`, `pending_rank = null` に更新する。

## 冪等性

Stripe Webhookは同一イベントが複数回配信され得る。`users` テーブルの状態更新は既に同じ値であれば再適用しても副作用がない設計（べき等）とする。DBトランザクションでの二重処理防止は既存のWebhookハンドラーの実装パターンに合わせる。
