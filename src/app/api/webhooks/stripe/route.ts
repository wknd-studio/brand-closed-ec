import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { SPAN_OP } from "@/lib/observability/span";
import {
  markCheckoutOrderAsPaid,
  markInvoiceOrderAsPaid,
} from "@/composition/order-payment";
import { completeSubscriptionOnboarding } from "@/composition/onboarding";
import {
  constructStripeWebhookEvent,
  isPaidRank,
  processStripeWebhookEventOnce,
  retrieveOnboardingSubscription,
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
      const clerkUserId = session.metadata?.clerk_user_id;
      const plan = session.metadata?.plan;

      // ENTERPRISE（Dashboardで作る契約）などアプリ外で作られたセッションには入会の
      // metadataが無い。2xx以外を返すとStripeが再送を続け、失敗が続くとエンドポイントが
      // 無効化されるため、運営者に知らせたうえで200を返す
      if (!clerkUserId || !plan || !isPaidRank(plan)) {
        Sentry.captureMessage(
          "入会のCheckoutセッションのmetadataが無い、または不正なため入会を確定しませんでした",
          {
            level: "warning",
            tags: { webhook: "stripe", eventType: event.type },
            extra: {
              stripeCheckoutSessionId: session.id,
              eventId: event.id,
              metadata: session.metadata,
            },
          }
        );
        return NextResponse.json({ received: true });
      }

      // 入会は決済完了で確定する（docs/signup-flow.md 設計決定事項#5）。入会のCheckoutは
      // カード決済に限定しているため、paid以外は想定外として運営者に知らせる
      if (session.payment_status !== "paid") {
        Sentry.captureMessage(
          "入会のCheckoutセッションが支払い済みでないため入会を確定しませんでした",
          {
            level: "warning",
            tags: { webhook: "stripe", eventType: event.type },
            extra: {
              stripeCheckoutSessionId: session.id,
              eventId: event.id,
              clerkUserId,
              paymentStatus: session.payment_status,
            },
          }
        );
        return NextResponse.json({ received: true });
      }

      const stripeCustomerId = session.customer as string;
      const stripeSubscriptionId = session.subscription as string;

      // 同じイベントの再送はここでスキップし、同じサブスクリプションの別イベントは
      // 入会確定のRPC（confirm_subscription_onboarding）の冪等性で防ぐ
      const outcome = await processStripeWebhookEventOnce({
        event: { eventId: event.id, type: event.type, payload: event },
        process: async () => {
          const {
            status,
            currentPeriodStart,
            currentPeriodEnd,
            subscriptionStartedAt,
          } = await retrieveOnboardingSubscription(stripeSubscriptionId);

          const result = await Sentry.startSpan(
            { name: "completeSubscriptionOnboarding", op: SPAN_OP.webhook },
            () =>
              completeSubscriptionOnboarding({
                clerkUserId,
                plan,
                stripeCustomerId,
                stripeSubscriptionId,
                status,
                currentPeriodStart,
                currentPeriodEnd,
                subscriptionStartedAt,
              })
          );

          // 課金済みなのに記録されないサブスクリプション。再送しても成功しないため
          // 200を返してイベントを処理済みにし、運営者が手動で返金・解約する
          if (
            result === "conflicting_subscription" ||
            result === "member_not_found"
          ) {
            Sentry.captureMessage(
              result === "member_not_found"
                ? "退会済み、または未登録の会員の入会が届きました。手動で返金・解約してください"
                : "入会済みの会員、または別の会員で記録済みのサブスクリプションの入会が届きました。手動で返金・解約してください",
              {
                level: "error",
                tags: { webhook: "stripe", eventType: event.type },
                extra: {
                  stripeCheckoutSessionId: session.id,
                  eventId: event.id,
                  clerkUserId,
                  stripeCustomerId,
                  stripeSubscriptionId,
                },
              }
            );
          }
        },
        failureReport: {
          tags: { webhook: "stripe", eventType: event.type },
          extra: {
            stripeCheckoutSessionId: session.id,
            eventId: event.id,
            clerkUserId,
          },
        },
      });
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
