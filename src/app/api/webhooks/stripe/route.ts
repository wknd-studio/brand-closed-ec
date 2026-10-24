import { getStripe } from "@/lib/stripe";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { SPAN_OP } from "@/lib/observability/span";
import { markCheckoutOrderAsPaid } from "@/use-cases/mark-checkout-order-as-paid";
import { markInvoiceOrderAsPaid } from "@/use-cases/mark-invoice-order-as-paid";
import { completeSubscriptionOnboarding } from "@/use-cases/complete-subscription-onboarding";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseStripeWebhookEventRepository } from "@/infrastructure/supabase/supabase-stripe-webhook-event-repository";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseSubscriptionOnboardingRepository } from "@/infrastructure/supabase/supabase-subscription-onboarding-repository";
import { ResendNotificationService } from "@/infrastructure/resend/resend-notification-service";
import { ClerkAccountGateway } from "@/infrastructure/clerk/clerk-account-gateway";
import {
  toSubscriptionStatus,
  toSubscriptionPeriod,
} from "@/infrastructure/stripe/stripe-subscription-mapper";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import type { StripeWebhookEventClaimResult } from "@/repositories/stripe-webhook-event-repository";

/**
 * claimできなかった再送への応答。処理済みなら2xxでスキップする。処理中なら2xx以外を
 * 返してStripeに後で再送させる（Stripeは2xx以外の応答を配信失敗として自動で再送する）。
 * 2xxを返すと、元の処理が落ちたりfailedになったりしたときに再送が来ず回復できない（issue #424）。
 * 処理中の再送は正常系なのでSentryには送らない
 */
function skippedResponse(
  claim: Exclude<StripeWebhookEventClaimResult, "claimed">
) {
  if (claim === "processed") {
    return NextResponse.json({ received: true, skipped: true });
  }
  return NextResponse.json(
    { error: "イベントを処理中です。後で再送してください" },
    { status: 409 }
  );
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
    event = getStripe().webhooks.constructEvent(body, signature, secret);
  } catch {
    return NextResponse.json({ error: "署名が不正です" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;

    if (session.mode === "payment") {
      const webhookEventRepo = new SupabaseStripeWebhookEventRepository(
        createAdminClient()
      );
      // stripe_webhook_eventsによるDBレベルの冪等性チェック（issue #221）。
      // 処理中/処理済みの再送であればここでスキップし、後続のuse case側の
      // ステータスチェック（settlement.isPaid()）とあわせて二重の防御とする
      const claim = await webhookEventRepo.claim({
        eventId: event.id,
        type: event.type,
        payload: event,
      });
      if (claim !== "claimed") return skippedResponse(claim);

      const deps = {
        orderRepo: new SupabaseOrderRepository(createAdminClient()),
        userRepo: new SupabaseUserRepository(createAdminClient()),
        notificationService: new ResendNotificationService(),
      };

      try {
        await Sentry.startSpan(
          { name: "markCheckoutOrderAsPaid", op: SPAN_OP.webhook },
          () =>
            markCheckoutOrderAsPaid(
              { stripeCheckoutSessionId: session.id },
              deps
            )
        );
        await webhookEventRepo.markProcessed(event.id);
      } catch (err) {
        Sentry.captureException(err, {
          tags: { webhook: "stripe", eventType: event.type },
          extra: { stripeCheckoutSessionId: session.id, eventId: event.id },
        });
        const message = err instanceof Error ? err.message : String(err);
        await webhookEventRepo.markFailed(event.id, message);
        console.error("[Checkout Webhook] 処理失敗:", err);
        return NextResponse.json(
          { error: "処理に失敗しました" },
          { status: 500 }
        );
      }
    } else if (session.mode === "subscription") {
      const clerkUserId = session.metadata?.clerk_user_id;
      const plan = session.metadata?.plan as MemberRankValue | undefined;

      if (!clerkUserId || !plan) {
        return NextResponse.json(
          { error: "メタデータが不足しています" },
          { status: 400 }
        );
      }

      try {
        const subscription = await getStripe().subscriptions.retrieve(
          session.subscription as string
        );
        const { currentPeriodStart, currentPeriodEnd } =
          toSubscriptionPeriod(subscription);
        const status = toSubscriptionStatus(subscription.status);

        await Sentry.startSpan(
          { name: "completeSubscriptionOnboarding", op: SPAN_OP.webhook },
          () =>
            completeSubscriptionOnboarding(
              {
                clerkUserId,
                plan,
                stripeCustomerId: session.customer as string,
                stripeSubscriptionId: session.subscription as string,
                status,
                currentPeriodStart,
                currentPeriodEnd,
              },
              {
                userRepo: new SupabaseUserRepository(createAdminClient()),
                onboardingRepo: new SupabaseSubscriptionOnboardingRepository(
                  createAdminClient()
                ),
                accountGateway: new ClerkAccountGateway(),
              }
            )
        );
      } catch (err) {
        Sentry.captureException(err, {
          tags: { webhook: "stripe", eventType: event.type },
          extra: {
            stripeCheckoutSessionId: session.id,
            eventId: event.id,
            clerkUserId,
          },
        });
        console.error("[Stripe Webhook] サブスクリプション更新失敗:", err);
        return NextResponse.json(
          { error: "処理に失敗しました" },
          { status: 500 }
        );
      }
    }
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    const webhookEventRepo = new SupabaseStripeWebhookEventRepository(
      createAdminClient()
    );
    const claim = await webhookEventRepo.claim({
      eventId: event.id,
      type: event.type,
      payload: event,
    });
    if (claim !== "claimed") return skippedResponse(claim);

    const deps = {
      orderRepo: new SupabaseOrderRepository(createAdminClient()),
      userRepo: new SupabaseUserRepository(createAdminClient()),
      notificationService: new ResendNotificationService(),
    };

    try {
      await Sentry.startSpan(
        { name: "markInvoiceOrderAsPaid", op: SPAN_OP.webhook },
        () => markInvoiceOrderAsPaid({ stripeInvoiceId: invoice.id }, deps)
      );
      await webhookEventRepo.markProcessed(event.id);
    } catch (err) {
      Sentry.captureException(err, {
        tags: { webhook: "stripe", eventType: event.type },
        extra: { stripeInvoiceId: invoice.id, eventId: event.id },
      });
      const message = err instanceof Error ? err.message : String(err);
      await webhookEventRepo.markFailed(event.id, message);
      console.error("[Invoice Webhook] 処理失敗:", err);
      return NextResponse.json(
        { error: "処理に失敗しました" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}
