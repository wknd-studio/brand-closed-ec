import { getStripe } from "@/lib/stripe";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { markCheckoutOrderAsPaid } from "@/use-cases/mark-checkout-order-as-paid";
import { markInvoiceOrderAsPaid } from "@/use-cases/mark-invoice-order-as-paid";
import { completeSubscriptionOnboarding } from "@/use-cases/complete-subscription-onboarding";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { ResendNotificationService } from "@/infrastructure/resend/resend-notification-service";
import { ClerkAccountGateway } from "@/infrastructure/clerk/clerk-account-gateway";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";

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
      const deps = {
        orderRepo: new SupabaseOrderRepository(createAdminClient()),
        userRepo: new SupabaseUserRepository(createAdminClient()),
        notificationService: new ResendNotificationService(),
      };

      try {
        await Sentry.startSpan(
          { name: "markCheckoutOrderAsPaid", op: "webhook.process" },
          () =>
            markCheckoutOrderAsPaid(
              { stripeCheckoutSessionId: session.id },
              deps
            )
        );
      } catch (err) {
        Sentry.captureException(err, {
          tags: { webhook: "stripe", eventType: event.type },
          extra: { stripeCheckoutSessionId: session.id, eventId: event.id },
        });
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
        await Sentry.startSpan(
          { name: "completeSubscriptionOnboarding", op: "webhook.process" },
          () =>
            completeSubscriptionOnboarding(
              {
                clerkUserId,
                plan,
                stripeCustomerId: session.customer as string,
                stripeSubscriptionId: session.subscription as string,
              },
              {
                userRepo: new SupabaseUserRepository(createAdminClient()),
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
    const deps = {
      orderRepo: new SupabaseOrderRepository(createAdminClient()),
      userRepo: new SupabaseUserRepository(createAdminClient()),
      notificationService: new ResendNotificationService(),
    };

    try {
      await Sentry.startSpan(
        { name: "markInvoiceOrderAsPaid", op: "webhook.process" },
        () => markInvoiceOrderAsPaid({ stripeInvoiceId: invoice.id }, deps)
      );
    } catch (err) {
      Sentry.captureException(err, {
        tags: { webhook: "stripe", eventType: event.type },
        extra: { stripeInvoiceId: invoice.id, eventId: event.id },
      });
      console.error("[Invoice Webhook] 処理失敗:", err);
      return NextResponse.json(
        { error: "処理に失敗しました" },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ received: true });
}
