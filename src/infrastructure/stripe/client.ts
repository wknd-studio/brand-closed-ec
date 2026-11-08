import Stripe from "stripe";

let _stripe: Stripe | null = null;

// Cloudflare Workers (Edge) では Node.js の http モジュールが使えないため
// Fetch API ベースの HTTP クライアントを明示する。
// ビルド時に STRIPE_SECRET_KEY が存在しないため遅延初期化する。
export function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      httpClient: Stripe.createFetchHttpClient(),
    });
  }
  return _stripe;
}

// enterpriseは個別契約のためセルフサービスのPaidRankには含めない（FR-006）
export type PaidRank =
  | "starter"
  | "basic"
  | "standard"
  | "pro"
  | "advanced"
  | "premium";

export const STRIPE_PRICE_IDS: Record<
  PaidRank,
  { monthly: string; initialFee: string }
> = {
  starter: {
    monthly: process.env.STRIPE_PRICE_ID_STARTER!,
    initialFee: process.env.STRIPE_PRICE_ID_STARTER_INITIAL_FEE!,
  },
  basic: {
    monthly: process.env.STRIPE_PRICE_ID_BASIC!,
    initialFee: process.env.STRIPE_PRICE_ID_BASIC_INITIAL_FEE!,
  },
  standard: {
    monthly: process.env.STRIPE_PRICE_ID_STANDARD!,
    initialFee: process.env.STRIPE_PRICE_ID_STANDARD_INITIAL_FEE!,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_ID_PRO!,
    initialFee: process.env.STRIPE_PRICE_ID_PRO_INITIAL_FEE!,
  },
  advanced: {
    monthly: process.env.STRIPE_PRICE_ID_ADVANCED!,
    initialFee: process.env.STRIPE_PRICE_ID_ADVANCED_INITIAL_FEE!,
  },
  premium: {
    monthly: process.env.STRIPE_PRICE_ID_PREMIUM!,
    initialFee: process.env.STRIPE_PRICE_ID_PREMIUM_INITIAL_FEE!,
  },
};
