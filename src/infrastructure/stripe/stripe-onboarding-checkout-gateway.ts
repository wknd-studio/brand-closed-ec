import type Stripe from "stripe";
import { getStripe, STRIPE_PRICE_IDS } from "@/lib/stripe";
import type {
  OnboardingCheckoutGateway,
  OnboardingCheckoutSessionInput,
} from "@/repositories/onboarding-checkout-gateway";

// 解約済み（canceled）と、初回の支払いが期限内に完了せず失効した（incomplete_expired）
// もの以外は、まだ請求が続きうるため、新しく決済させると二重課金になる
const ENDED_STATUSES: ReadonlySet<Stripe.Subscription.Status> = new Set([
  "canceled",
  "incomplete_expired",
]);

export class StripeOnboardingCheckoutGateway implements OnboardingCheckoutGateway {
  async createCustomer(input: {
    userId: string;
    clerkUserId: string;
    email: string;
  }): Promise<string> {
    const customer = await getStripe().customers.create(
      {
        email: input.email,
        metadata: {
          supabase_user_id: input.userId,
          clerk_user_id: input.clerkUserId,
        },
      },
      // 決済画面を同時に開いても、保存前のCustomerが2つできないようにする
      { idempotencyKey: `onboarding-customer-${input.userId}` }
    );
    return customer.id;
  }

  async hasActiveSubscription(stripeCustomerId: string): Promise<boolean> {
    // 検索API（subscriptions.search）は反映が最大1分ほど遅れるため、決済直後の
    // サブスクリプションを見落とさないよう、Customerに紐づく一覧で確認する。
    // 入会時の決済しかしないCustomerのため、1ページ（100件）に収まる
    const { data } = await getStripe().subscriptions.list({
      customer: stripeCustomerId,
      status: "all",
      limit: 100,
    });
    return data.some((s) => !ENDED_STATUSES.has(s.status));
  }

  async createCheckoutSession(
    input: OnboardingCheckoutSessionInput
  ): Promise<string | null> {
    const session = await getStripe().checkout.sessions.create(
      {
        mode: "subscription",
        customer: input.stripeCustomerId,
        line_items: [
          { price: STRIPE_PRICE_IDS[input.rank].monthly, quantity: 1 },
          { price: STRIPE_PRICE_IDS[input.rank].initialFee, quantity: 1 },
        ],
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/payment/cancel`,
        metadata: {
          clerk_user_id: input.clerkUserId,
          plan: input.rank,
        },
        // customer.subscription.*のWebhookでも会員を特定できるようにする
        subscription_data: {
          metadata: { clerk_user_id: input.clerkUserId },
        },
        locale: "ja",
      },
      {
        // 請求内容はusersの行に保存したランクから決めるため、冪等キーも
        // 同じusersの行とランクで一意にする
        idempotencyKey: `onboarding-checkout-session-${input.userId}-${input.rank}`,
      }
    );
    return session.url;
  }
}
