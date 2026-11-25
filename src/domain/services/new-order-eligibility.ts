import { SubscriptionPaymentFailedError } from "@/domain/errors/subscription-payment-failed-error";
import type { SubscriptionStatus } from "@/domain/value-objects/subscription-status";

/**
 * 月額費用の支払い失敗中か。Stripe が再請求している間の past_due と、使わない設定だが
 * 万一なった場合の unpaid（docs/domain/subscription-billing.md「支払い失敗・Stripe側の解約」）。
 * 解約済みでないサブスクリプションの行が無い会員（null）は、ここでは支払い失敗中にしない
 * （利用停止の判定は入会済みかどうかと合わせて行う。#380）
 */
export function isSubscriptionPaymentFailed(
  status: SubscriptionStatus | null
): boolean {
  return status === "past_due" || status === "unpaid";
}

/**
 * 新規の注文を確定できるか。支払い失敗中は止める。進行中の注文の続き（請求書払いの支払い・
 * 運営者による請求作成など）はここを通さない（docs/domain/ordering.md「新規注文を止める条件」）
 */
export function assertCanPlaceNewOrder(
  status: SubscriptionStatus | null
): void {
  if (isSubscriptionPaymentFailed(status))
    throw new SubscriptionPaymentFailedError();
}
