"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { getStripe } from "@/lib/stripe";
import { fetchProductsByIds, type MemberRank } from "@/lib/sanity/products";
import { parseCart, COOKIE_NAME } from "@/lib/cart/cookie";
import { MONTHLY_LIMITS } from "@/lib/constants/membership";

import { checkMonthlyLimit } from "./monthly-limit";

type PlaceOrderResult = { error: string };

function getCurrentMonthRange(subscribedAt: string | null): {
  start: string;
  end: string;
} {
  const now = new Date();
  if (!subscribedAt) {
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      end: new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString(),
    };
  }
  const day = new Date(subscribedAt).getDate();
  const startThisMonth = new Date(now.getFullYear(), now.getMonth(), day);
  if (now >= startThisMonth) {
    return {
      start: startThisMonth.toISOString(),
      end: new Date(now.getFullYear(), now.getMonth() + 1, day).toISOString(),
    };
  }
  return {
    start: new Date(now.getFullYear(), now.getMonth() - 1, day).toISOString(),
    end: startThisMonth.toISOString(),
  };
}

export async function placeOrder(
  shippingAddressId: string,
  billingAddressId: string
): Promise<PlaceOrderResult | never> {
  const { userId } = await auth();
  if (!userId) return { error: "認証されていません" };

  const cookieStore = await cookies();
  const cart = parseCart(cookieStore.get(COOKIE_NAME)?.value);
  if (cart.items.length === 0) return { error: "カートが空です" };

  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id, rank, subscribed_at")
    .eq("clerk_user_id", userId)
    .single();
  if (!user) return { error: "ユーザーが見つかりません" };

  const userRank = user.rank as MemberRank;
  const monthlyLimit = MONTHLY_LIMITS[userRank] ?? 0;

  // 確定済み月次使用額を計算
  const { start, end } = getCurrentMonthRange(user.subscribed_at);
  const { data: confirmedOrders } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", user.id)
    .neq("status", "cancelled")
    .gte("created_at", start)
    .lt("created_at", end);

  const orderIds = confirmedOrders?.map((o) => o.id) ?? [];
  let confirmedAmount = 0;
  if (orderIds.length > 0) {
    const { data: items } = await supabase
      .from("order_items")
      .select("unit_price_snapshot, quantity")
      .in("order_id", orderIds)
      .not("unit_price_snapshot", "is", null);
    confirmedAmount = (items ?? []).reduce(
      (sum, i) => sum + (i.unit_price_snapshot ?? 0) * i.quantity,
      0
    );
  }

  // Sanityから正規価格を取得
  const products = await fetchProductsByIds(cart.items.map((i) => i.productId));
  const lineItems = cart.items.map((item) => {
    const product = products.find((p) => p._id === item.productId);
    const unitPrice = product?.is_negotiable
      ? null
      : (product?.prices?.[userRank] ?? null);
    return {
      productId: item.productId,
      productName: product?.name ?? item.productName,
      quantity: item.quantity,
      unitPrice,
      isNegotiable: product?.is_negotiable ?? false,
    };
  });

  const fixedTotal = lineItems.reduce((sum, i) => {
    if (i.unitPrice === null) return sum;
    return sum + i.unitPrice * i.quantity;
  }, 0);
  const hasNegotiable = lineItems.some((i) => i.isNegotiable);

  const limitError = checkMonthlyLimit(
    confirmedAmount,
    fixedTotal,
    monthlyLimit
  );
  if (limitError) return { error: limitError };

  // 住所スナップショットを取得
  const [{ data: shippingAddr }, { data: billingAddr }] = await Promise.all([
    supabase.from("addresses").select("*").eq("id", shippingAddressId).single(),
    supabase.from("addresses").select("*").eq("id", billingAddressId).single(),
  ]);
  if (!shippingAddr || !billingAddr) return { error: "住所が見つかりません" };

  if (hasNegotiable) {
    // Invoice フロー（BRAND-63で実装）
    return { error: "Invoiceフローは準備中です" };
  }

  // Checkout フロー
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      user_id: user.id,
      payment_flow: "checkout",
      status: "pending_payment",
      rank_at_order: userRank,
      monthly_limit_at_order: monthlyLimit,
      shipping_address_snapshot: shippingAddr,
      billing_address_snapshot: billingAddr,
    })
    .select()
    .single();

  if (orderError || !order) return { error: "注文の記録に失敗しました" };

  await supabase.from("order_items").insert(
    lineItems.map((i) => ({
      order_id: order.id,
      sanity_product_id: i.productId,
      product_name_snapshot: i.productName,
      quantity: i.quantity,
      unit_price_snapshot: i.unitPrice,
      is_negotiable: i.isNegotiable,
    }))
  );

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    line_items: lineItems.map((i) => ({
      price_data: {
        currency: "jpy",
        unit_amount: i.unitPrice!,
        product_data: { name: i.productName },
      },
      quantity: i.quantity,
    })),
    success_url: `${baseUrl}/order/complete?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/order/checkout`,
    metadata: { order_id: order.id },
  });

  await supabase
    .from("orders")
    .update({ stripe_checkout_session_id: session.id })
    .eq("id", order.id);

  redirect(session.url!);
}
