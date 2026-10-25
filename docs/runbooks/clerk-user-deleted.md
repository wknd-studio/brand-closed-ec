# 退会処理を通らずに Clerk アカウントが削除されたとき

Sentry に次の error が届いたときの対応手順（#531）。

> 退会処理を通らずにClerkアカウントが削除されました。Stripeのサブスクを解約し、users.deleted_atを設定してください

## 何が起きているか

会員の Clerk アカウントが、アプリの退会処理（`src/use-cases/withdraw.ts`）を通らずに削除された。Clerk ダッシュボードからの手動削除・Clerk API の直接呼び出し・Self Service Delete が有効に戻っていた、などが考えられる。

この場合、アプリは次の状態のまま残る（Webhook は自動で退会扱いにしない。最低利用期間内の解約など業務判断を伴うため）。

- Stripe のサブスクリプションが有効なままで、課金が続く
- `users` 行が有効な会員（`deleted_at` が空）のまま残る

会員はもうログインできない（Clerk アカウントが無いため）。

## 通知に入っている情報

Sentry のイベントの `extra` に入っている。

| 項目          | 内容                           |
| ------------- | ------------------------------ |
| `clerkUserId` | 削除された Clerk ユーザーの ID |
| `userId`      | `users.id`                     |
| `svixId`      | Clerk Webhook の配信 ID        |

## 対応手順

1. **削除の経緯を確かめる**: Clerk ダッシュボードの監査ログや運営者への確認で、誰がなぜ削除したかを確かめる。意図しない削除（誤操作・Self Service Delete が有効に戻っていた等）なら、再発防止（設定の戻し等）も合わせて行う
2. **解約の扱いを決める**: 会員の契約状況（最低利用期間・未解決の決済単位・進行中の注文）を確かめ、即時解約か期間末解約か、返金の要否を決める。退会のルールは `docs/domain/membership.md` の「退会」を参照
3. **Stripe のサブスクを解約する**: `subscriptions` から対象を探し、Stripe ダッシュボードで解約する
   ```sql
   select stripe_subscription_id, status, current_period_end
   from subscriptions
   where user_id = '<userId>';
   ```
4. **`users.deleted_at` を設定する**: 退会処理と同じく論理削除にする（行は消さない）
   ```sql
   update users
   set deleted_at = now()
   where id = '<userId>' and deleted_at is null;
   ```
5. Sentry のイベントを Resolved にする

## 関連

- Webhook の実装: `src/app/api/webhooks/clerk/route.ts`（`user.deleted`）
- Self Service Delete を無効にしている理由: `docs/ai-prompts/clerk.md` の「Self Service Delete」
