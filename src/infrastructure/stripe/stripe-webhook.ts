import type Stripe from "stripe";
import { getStripe } from "@/infrastructure/stripe/client";

// 署名が不正なら Stripe のエラーをそのまま投げる
export function constructStripeWebhookEvent(
  body: string,
  signature: string,
  secret: string
): Stripe.Event {
  return getStripe().webhooks.constructEvent(body, signature, secret);
}
