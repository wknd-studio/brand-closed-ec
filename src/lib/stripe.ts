import Stripe from "stripe";

// Cloudflare Workers (Edge) では Node.js の http モジュールが使えないため
// Fetch API ベースの HTTP クライアントを明示する
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  httpClient: Stripe.createFetchHttpClient(),
});

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
