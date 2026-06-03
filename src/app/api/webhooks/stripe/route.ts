import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { sendCheckoutPaidEmails } from "@/lib/email/checkout-paid";
import { sendInvoicePaidEmail } from "@/lib/email/invoice-paid";
import { getStripe } from "@/lib/stripe";
import { NextResponse } from "next/server";
import type { Database } from "@/types/database.types";

type MemberRank = Database["public"]["Enums"]["member_rank"];

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
      const orderId = session.metadata?.order_id;
      if (!orderId) {
        return NextResponse.json(
          { error: "order_id がありません" },
          { status: 400 }
        );
      }

      const supabase = createAdminClient();
      const { data: order } = await supabase
        .from("orders")
        .select(
          "id, status, user_id, order_items(product_name_snapshot, quantity, unit_price_snapshot, is_negotiable)"
        )
        .eq("id", orderId)
        .single();

      if (!order) {
        return NextResponse.json(
          { error: "注文が見つかりません" },
          { status: 400 }
        );
      }

      if (order.status === "paid") {
        return NextResponse.json({ received: true });
      }

      const { error: updateError } = await supabase
        .from("orders")
        .update({ status: "paid" })
        .eq("id", order.id);

      if (updateError) {
        console.error("[注文Webhook] ステータス更新失敗:", updateError);
        return NextResponse.json(
          { error: "DB更新に失敗しました" },
          { status: 500 }
        );
      }

      const { data: user } = await supabase
        .from("users")
        .select("email")
        .eq("clerk_user_id", order.user_id)
        .single();

      if (user) {
        const lineItems = (
          order.order_items as Array<{
            product_name_snapshot: string;
            quantity: number;
            unit_price_snapshot: number | null;
            is_negotiable: boolean;
          }>
        ).map((item) => ({
          productName: item.product_name_snapshot,
          quantity: item.quantity,
          unitPrice: item.unit_price_snapshot,
          isNegotiable: item.is_negotiable,
        }));

        sendCheckoutPaidEmails({
          orderId: order.id,
          memberEmail: user.email,
          lineItems,
        }).catch((e) => console.error("[Checkout入金メール] 送信エラー:", e));
      }
    } else if (session.mode === "subscription") {
      const clerkUserId = session.metadata?.clerk_user_id;
      const plan = session.metadata?.plan as MemberRank | undefined;

      if (!clerkUserId || !plan) {
        return NextResponse.json(
          { error: "メタデータが不足しています" },
          { status: 400 }
        );
      }

      const supabase = createAdminClient();
      const { error } = await supabase
        .from("users")
        .update({
          rank: plan,
          stripe_customer_id: session.customer as string | null,
          stripe_subscription_id: session.subscription as string | null,
          subscribed_at: new Date().toISOString(),
          onboarding_completed: true,
        })
        .eq("clerk_user_id", clerkUserId);

      if (error) {
        console.error("[Stripe Webhook] Supabase 更新失敗:", error);
        return NextResponse.json(
          { error: "DB更新に失敗しました" },
          { status: 500 }
        );
      }

      const clerk = await clerkClient();
      await clerk.users.updateUserMetadata(clerkUserId, {
        publicMetadata: { onboarding_completed: true },
      });
    }
  }

  if (event.type === "invoice.paid") {
    const invoice = event.data.object;
    const supabase = createAdminClient();

    const { data: order } = await supabase
      .from("orders")
      .select("id, status, user_id")
      .eq("stripe_invoice_id", invoice.id)
      .single();

    if (!order) {
      return NextResponse.json({ received: true });
    }

    if (order.status === "paid") {
      return NextResponse.json({ received: true });
    }

    const { error: updateError } = await supabase
      .from("orders")
      .update({ status: "paid" })
      .eq("id", order.id);

    if (updateError) {
      console.error("[Invoice Webhook] ステータス更新失敗:", updateError);
      return NextResponse.json(
        { error: "DB更新に失敗しました" },
        { status: 500 }
      );
    }

    const { data: user } = await supabase
      .from("users")
      .select("email")
      .eq("clerk_user_id", order.user_id)
      .single();

    if (user) {
      sendInvoicePaidEmail({
        orderId: order.id,
        memberEmail: user.email,
      }).catch((e) => console.error("[Invoice入金メール] 送信エラー:", e));
    }
  }

  return NextResponse.json({ received: true });
}
