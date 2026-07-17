# Phase 0 Research: プラン変更（アップグレード・ダウングレード）

技術的な検討はすでに `docs/plan-change-flow.md` として行われているため、Phase 0では新規調査ではなく、既存の検討内容を意思決定記録の形式に整理する。

## Decision: アップグレードは即時反映・期間リセット

- **Decision**: `stripe.subscriptions.update()` で `billing_cycle_anchor: 'now'` を指定し、変更日を新しい請求期間の起点にリセットする。`proration_behavior: 'create_prorations'` で旧期間の差額を日割り精算する
- **Rationale**: spec.mdのFR-002（即時反映・上限リセット）を満たす標準的なStripeの仕組み。自前で期間管理ロジックを持たずに済む
- **Alternatives considered**: 期間をリセットせず日割りなしで即時切替 → 会員が「今月払った分」と「新プランの上限」の対応が直感的でなくなるため却下

## Decision: ダウングレードはStripe Subscription Scheduleで期末適用

- **Decision**: `stripe.subscriptionSchedules.create()` で2フェーズ（現プラン継続→新プランへ切替）のスケジュールを作成する。期末に達するとStripeが自動で価格を切り替え、Webhook（`customer.subscription.updated`、`schedule`フィールドあり）で検知してDBを更新する
- **Rationale**: 期日管理をStripe側に委譲でき、自前でcronジョブ等を持つ必要がない
- **Alternatives considered**: 自前でバッチジョブを組んで期末に切替 → Stripe側の請求サイクルとのズレ・二重管理のリスクがあるため却下

## Decision: 初期費用は差分請求、支払い済み最高ランクをDBで保持

- **Decision**: `initial_fee_paid_rank` カラムを保持し、アップグレード時は `新プランの初期費用 - initial_fee_paid_rankの初期費用` の差額のみ請求する。ダウングレードでは変更しない（退会後も保持）
- **Rationale**: `docs/archive/service-spec.md` の「ランク変更ルール」に既に明記されている確定仕様。差分請求により「使ったことのある機能に再度満額払う」不公平を避ける
- **Alternatives considered**: なし（既に確定仕様）

## Decision: ダウングレード予約中の再変更はスケジュールを上書き

- **Decision**: `stripe_subscription_schedule_id` が既にある状態で別プランへの変更が申請された場合、既存スケジュールを`release`してから新しいスケジュールを作成する。Gateway内でスケジュールが既にリリース済み（Stripeのwebhook遅延等）の場合は`already-released`エラーをキャッチして`create`にフォールバックする
- **Rationale**: `docs/plan-change-flow.md` の「実装上の注意点」で既に指摘されている既知のエッジケース対応
- **Alternatives considered**: なし（既知の対応方針）

## NEEDS CLARIFICATION（未解決）

- 7ランクモデル（STARTER〜ENTERPRISE）自体の実装状況。`plan.md` のComplexity Trackingに記載の通り、別specとして先に完了させる前提とし、本研究では現行の5ランク実装からの差分としては扱わない
