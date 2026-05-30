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

  return NextResponse.json({ received: true });
}
