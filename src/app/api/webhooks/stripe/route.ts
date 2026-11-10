import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { SPAN_OP } from "@/lib/observability/span";
import {
  markCheckoutOrderAsPaid,
  markInvoiceOrderAsPaid,
} from "@/composition/order-payment";
import { completeOnboardingCheckout } from "@/composition/onboarding";
import {
  constructStripeWebhookEvent,
  processStripeWebhookEventOnce,
  type ProcessStripeWebhookEventOnceResult,
} from "@/composition/stripe-webhook";

/**
 * claimできなかった再送への応答。処理済みなら2xxでスキップする。処理中なら2xx以外を
 * 返してStripeに後で再送させる（Stripeは2xx以外の応答を配信失敗として自動で再送する）。
 * 2xxを返すと、元の処理が落ちたりfailedになったりしたときに再送が来ず回復できない（issue #424）。
 * 処理中の再送は正常系なのでSentryには送らない
 */
function skippedResponse(
  claim: Extract<
    ProcessStripeWebhookEventOnceResult,
    { status: "skipped" }
  >["claim"]
) {
  if (claim === "processed") {
    return NextResponse.json({ received: true, skipped: true });
  }
  return NextResponse.json(
    { error: "イベントを処理中です。後で再送してください" },
    { status: 409 }
  );
}

/** 処理に失敗したイベントへの応答。2xx以外を返してStripeに再送させる */
function failedResponse(logPrefix: string, error: unknown) {
  console.error(logPrefix, error);
  return NextResponse.json({ error: "処理に失敗しました" }, { status: 500 });
}

export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET が未設定です");

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "stripe-signature ヘッダーがありません" },
      { status: 400 }
    );
  }

  const body = await req.text();

  let event;
  try {
    event = constructStripeWebhookEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "署名が不正です" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    if (session.mode === "payment") {
      // 処理中/処理済みの再送であればここでスキップし、後続のuse case側の
      // ステータスチェック（settlement.isPaid()）とあわせて二重の防御とする
      const outcome = await processStripeWebhookEventOnce({
        event: { eventId: event.id, type: event.type, payload: event },
        process: () =>
          Sentry.startSpan(
            { name: "markCheckoutOrderAsPaid", op: SPAN_OP.webhook },
            () =>
              markCheckoutOrderAsPaid({ stripeCheckoutSessionId: session.id })
          ),
        failureReport: {
          tags: { webhook: "stripe", eventType: event.type },
          extra: { stripeCheckoutSessionId: session.id, eventId: event.id },
        },
      });
      if (outcome.status === "skipped") return skippedResponse(outcome.claim);
      if (outcome.status === "failed") {
        return failedResponse("[Checkout Webhook] 処理失敗:", outcome.error);
      }
    } else if (session.mode === "subscription") {
      // 入会を確定しない入力（metadata・payment_statusが不正）や確定できなかった結果は、
      // use-caseが運営者に知らせたうえで200を返させる
      const outcome = await Sentry.startSpan(
        { name: "completeSubscriptionOnboarding", op: SPAN_OP.webhook },
        () =>
          completeOnboardingCheckout({
            event: { eventId: event.id, type: event.type, payload: event },
            stripeCheckoutSessionId: session.id,
            metadata: session.metadata,
            paymentStatus: session.payment_status,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
          })
      );
      if (outcome.status === "skipped") return skippedResponse(outcome.claim);
      if (outcome.status === "failed") {
        return failedResponse(
          "[Stripe Webhook] サブスクリプション更新失敗:",
          outcome.error
        );
      }
    }
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    const outcome = await processStripeWebhookEventOnce({
      event: { eventId: event.id, type: event.type, payload: event },
      process: () =>
        Sentry.startSpan(
          { name: "markInvoiceOrderAsPaid", op: SPAN_OP.webhook },
          () => markInvoiceOrderAsPaid({ stripeInvoiceId: invoice.id })
        ),
      failureReport: {
        tags: { webhook: "stripe", eventType: event.type },
        extra: { stripeInvoiceId: invoice.id, eventId: event.id },
      },
    });
    if (outcome.status === "skipped") return skippedResponse(outcome.claim);
    if (outcome.status === "failed") {
      return failedResponse("[Invoice Webhook] 処理失敗:", outcome.error);
    }
  }

  return NextResponse.json({ received: true });
}
