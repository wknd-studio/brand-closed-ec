import { getStripe } from "@/infrastructure/stripe/client";
import type { BillingPortalGateway } from "@/repositories/billing-portal-gateway";

export class StripeBillingPortalGateway implements BillingPortalGateway {
  async createBillingPortalSession(stripeCustomerId: string): Promise<string> {
    // configuration を省くと Stripe の既定の設定が使われ、解約・プラン変更ができてしまう（退会の
    // 6ヶ月縛り・未解決の決済のチェックを迂回できる）ため、設定が無ければ Session を作らない。
    // 設定は scripts/setup-stripe-billing-portal.ts で作る
    const configuration = process.env.STRIPE_BILLING_PORTAL_CONFIGURATION_ID;
    if (!configuration) {
      throw new Error("STRIPE_BILLING_PORTAL_CONFIGURATION_ID が未設定です");
    }
    const session = await getStripe().billingPortal.sessions.create({
      customer: stripeCustomerId,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings`,
      configuration,
      locale: "ja",
    });
    return session.url;
  }
}
