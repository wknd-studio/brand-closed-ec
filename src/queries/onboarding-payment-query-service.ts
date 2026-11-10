// 決済完了画面（/onboarding/payment/success）の決済の完了の確認
export interface OnboardingPaymentQueryService {
  // URLの session_id がこの会員の決済完了済みの Checkout Session か、この会員の Stripe Customer に
  // 有効なサブスクリプションがあれば true。他の会員・存在しない・形式でない session_id は false。
  // Stripe・DBの失敗で確かめられないときは例外
  findPaymentCompleted(input: {
    clerkUserId: string;
    sessionId: string | null;
  }): Promise<boolean>;
}
