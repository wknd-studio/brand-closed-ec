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

export type PaidRank = "entry" | "standard" | "pro";

export const STRIPE_PRICE_IDS: Record<
  PaidRank,
  { monthly: string; initialFee: string }
> = {
  entry: {
    monthly: process.env.STRIPE_PRICE_ID_ENTRY!,
    initialFee: process.env.STRIPE_PRICE_ID_INITIAL_FEE!,
  },
  standard: {
    monthly: process.env.STRIPE_PRICE_ID_STANDARD!,
    initialFee: process.env.STRIPE_PRICE_ID_INITIAL_FEE!,
  },
  pro: {
    monthly: process.env.STRIPE_PRICE_ID_PRO!,
    initialFee: process.env.STRIPE_PRICE_ID_INITIAL_FEE!,
  },
};
