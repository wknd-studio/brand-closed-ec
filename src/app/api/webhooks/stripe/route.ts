import { getStripe, STRIPE_PRICE_IDS, type PaidRank } from "@/lib/stripe";
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

// 入会のCheckoutはセルフサービスのランク（STRIPE_PRICE_IDSのキー）でしか作らない
function isPaidRank(plan: string): plan is PaidRank {
  return Object.hasOwn(STRIPE_PRICE_IDS, plan);
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

      const webhookEventRepo = new SupabaseStripeWebhookEventRepository(
        createAdminClient()
      );
      // 同じイベントの再送はここでスキップし、同じサブスクリプションの別イベントは
      // 入会確定のRPC（confirm_subscription_onboarding）の冪等性で防ぐ
      const claim = await webhookEventRepo.claim({
        eventId: event.id,
        type: event.type,
        payload: event,
      });
      if (claim !== "claimed") return skippedResponse(claim);

      const stripeCustomerId = session.customer as string;
      const stripeSubscriptionId = session.subscription as string;

      try {
        const subscription =
          await getStripe().subscriptions.retrieve(stripeSubscriptionId);
        const { currentPeriodStart, currentPeriodEnd } =
          toSubscriptionPeriod(subscription);
        const status = toSubscriptionStatus(subscription.status);

        const result = await Sentry.startSpan(
          { name: "completeSubscriptionOnboarding", op: SPAN_OP.webhook },
          () =>
            completeSubscriptionOnboarding(
              {
                clerkUserId,
                plan,
                stripeCustomerId,
                stripeSubscriptionId,
                status,
                currentPeriodStart,
                currentPeriodEnd,
                subscriptionStartedAt: new Date(subscription.start_date * 1000),
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

        // 課金済みなのに記録されないサブスクリプション。運営者が手動で返金・解約する
        if (result === "conflicting_subscription") {
          Sentry.captureMessage(
            "入会済みの会員に別のサブスクリプションの入会が届きました。手動で返金・解約してください",
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
        await webhookEventRepo.markProcessed(event.id);
      } catch (err) {
        Sentry.captureException(err, {
          tags: { webhook: "stripe", eventType: event.type },
          extra: {
            stripeCheckoutSessionId: session.id,
            eventId: event.id,
            clerkUserId,
          },
        });
        const message = err instanceof Error ? err.message : String(err);
        await webhookEventRepo.markFailed(event.id, message);
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
