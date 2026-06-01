import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { getStripe } from "@/lib/stripe";
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
      // 注文 Checkout フロー (BRAND-61)
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
        .select("id, status")
        .eq("id", orderId)
        .single();

      if (!order) {
        return NextResponse.json(
          { error: "注文が見つかりません" },
          { status: 400 }
        );
      }

      // 冪等性チェック：処理済みならスキップして 200 を返す
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

      // 運営者通知（メール実装は BRAND-64/66）
      console.log(`[注文確定] 注文ID: ${order.id} の入金確認`);
    } else if (session.mode === "subscription") {
      // オンボーディング Checkout フロー（既存）
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
    // Invoice フロー (BRAND-65)
    const invoice = event.data.object;
    const supabase = createAdminClient();

    const { data: order } = await supabase
      .from("orders")
      .select("id, status")
      .eq("stripe_invoice_id", invoice.id)
      .single();

    // 私たちが発行していない Invoice（サブスクリプション更新など）は無視
    if (!order) {
      return NextResponse.json({ received: true });
    }

    // 冪等性チェック：処理済みならスキップ
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

    // 運営者通知（メール実装は BRAND-64）
    console.log(`[Invoice入金確認] 注文ID: ${order.id} の入金確認`);
  }

  return NextResponse.json({ received: true });
}
