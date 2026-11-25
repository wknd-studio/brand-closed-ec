import Stripe from "stripe";

function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  // 本番の鍵で顧客・サブスクリプションを作らないよう、テストモードの鍵でだけ動かす
  if (!/^(sk|rk)_test_/.test(key)) {
    throw new Error(
      "STRIPE_SECRET_KEY がテストモードの鍵ではないため、テスト用のサブスクリプションを作りません"
    );
  }
  return new Stripe(key);
}

/**
 * Stripe（テストモード）に実在する、STARTERプランの月額のサブスクリプションを作る。
 * 退会はStripeのサブスクリプションを解約するため、subscriptions行に仮のIDしか無いと失敗する。
 * テストカード（pm_card_visa）で支払うので、作った時点で active になる
 */
export async function createStripeTestSubscription(email: string): Promise<{
  customerId: string;
  subscriptionId: string;
}> {
  const client = stripe();
  const customer = await client.customers.create({
    email,
    payment_method: "pm_card_visa",
    invoice_settings: { default_payment_method: "pm_card_visa" },
  });
  const subscription = await client.subscriptions.create({
    customer: customer.id,
    items: [{ price: process.env.STRIPE_PRICE_ID_STARTER! }],
  });
  return { customerId: customer.id, subscriptionId: subscription.id };
}

/** 顧客ごと消す。残っているサブスクリプションも Stripe が解約する */
export async function deleteStripeTestCustomer(
  customerId: string
): Promise<void> {
  await stripe()
    .customers.del(customerId)
    .catch(() => {});
}
