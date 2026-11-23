export interface BillingPortalGateway {
  // 会員がお支払い方法（カード）を変更する Stripe Billing Portal の Session を作り、その URL を返す
  createBillingPortalSession(stripeCustomerId: string): Promise<string>;
}
