"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { sendLimitExceededEmail } from "@/lib/email/limit-exceeded";
import { getStripe } from "@/lib/stripe";

type IssueInvoiceResult = { error: string };

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

export async function issueInvoice(
  orderId: string,
  formData: FormData
): Promise<IssueInvoiceResult | never> {
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  if (role !== "admin") return { error: "権限がありません" };

  const supabase = createAdminClient();

  // 1. 注文・会員情報取得
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, status, user_id, monthly_limit_at_order, users(id, email, stripe_customer_id, subscribed_at)"
    )
    .eq("id", orderId)
    .eq("status", "confirming")
    .single();
  if (!order) return { error: "注文が見つかりません" };

  const user = Array.isArray(order.users) ? order.users[0] : order.users;
  if (!user) return { error: "会員情報が見つかりません" };

  // 2. 注文明細取得
  const { data: items } = await supabase
    .from("order_items")
    .select(
      "id, product_name_snapshot, quantity, unit_price_snapshot, is_negotiable"
    )
    .eq("order_id", orderId);
  if (!items || items.length === 0)
    return { error: "注文明細が見つかりません" };

  // 3. 要相談価格をFormDataから取得・バリデーション
  const negotiableItems = items.filter((i) => i.is_negotiable);
  const negotiablePrices = new Map<string, number>();
  for (const item of negotiableItems) {
    const raw = formData.get(`price_${item.id}`);
    const price = Number(raw);
    if (!raw || isNaN(price) || price <= 0) {
      return {
        error: `「${item.product_name_snapshot}」の価格を入力してください`,
      };
    }
    negotiablePrices.set(item.id, price);
  }

  // 4. 月次仕入れ上限チェック（全額）
  const { start, end } = getCurrentMonthRange(
    (user as { subscribed_at?: string | null }).subscribed_at ?? null
  );
  const { data: confirmedOrders } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", order.user_id)
    .neq("status", "cancelled")
    .gte("created_at", start)
    .lt("created_at", end);

  const orderIds = confirmedOrders?.map((o) => o.id) ?? [];
  let confirmedAmount = 0;
  if (orderIds.length > 0) {
    const { data: confirmedItemsData } = await supabase
      .from("order_items")
      .select("unit_price_snapshot, quantity")
      .in("order_id", orderIds)
      .not("unit_price_snapshot", "is", null);
    confirmedAmount = (confirmedItemsData ?? []).reduce(
      (sum, i) => sum + (i.unit_price_snapshot ?? 0) * i.quantity,
      0
    );
  }

  const negotiableTotal = negotiableItems.reduce(
    (sum, item) => sum + (negotiablePrices.get(item.id) ?? 0) * item.quantity,
    0
  );

  const monthlyLimit = order.monthly_limit_at_order;
  if (monthlyLimit > 0 && confirmedAmount + negotiableTotal > monthlyLimit) {
    // ステータスを limit_exceeded に変更（初回のみメール送信）
    const isFirstTime = order.status === "confirming";
    await supabase
      .from("orders")
      .update({ status: "limit_exceeded" })
      .eq("id", orderId);

    if (isFirstTime) {
      await sendLimitExceededEmail({
        to: (user as { email: string }).email,
        orderId,
      });
    }

    return {
      error: `月次仕入れ上限（¥${monthlyLimit.toLocaleString()}）を超えるため発行できません。会員に通知しました。`,
    };
  }

  // 5. order_items の unit_price_snapshot を更新（DB を先に更新）
  for (const item of negotiableItems) {
    const price = negotiablePrices.get(item.id)!;
    const { error: updateError } = await supabase
      .from("order_items")
      .update({ unit_price_snapshot: price })
      .eq("id", item.id);
    if (updateError) {
      console.error("[Invoice発行] order_items更新失敗:", updateError);
      return { error: "価格の保存に失敗しました" };
    }
  }

  // 6. Stripe Customer を確保
  let stripeCustomerId = (user as { stripe_customer_id?: string | null })
    .stripe_customer_id;
  if (!stripeCustomerId) {
    try {
      const customer = await getStripe().customers.create({
        email: (user as { email: string }).email,
        metadata: { supabase_user_id: (user as { id: string }).id },
      });
      stripeCustomerId = customer.id;
      // 新規作成した Customer ID を users テーブルに保存
      await supabase
        .from("users")
        .update({ stripe_customer_id: stripeCustomerId })
        .eq("id", (user as { id: string }).id);
    } catch (err) {
      console.error("[Invoice発行] Stripe Customer作成失敗:", err);
      return { error: "Stripe顧客の作成に失敗しました" };
    }
  }

  // 7. Stripe Invoice 作成（draft）
  let invoiceId: string;
  try {
    const invoice = await getStripe().invoices.create({
      customer: stripeCustomerId,
      collection_method: "send_invoice",
      days_until_due: 7,
      metadata: { order_id: orderId },
    });
    invoiceId = invoice.id;
  } catch (err) {
    console.error("[Invoice発行] Stripe Invoice作成失敗:", err);
    return { error: "Invoice の作成に失敗しました" };
  }

  // 8. stripe_invoice_id を保存
  const { error: saveInvoiceIdError } = await supabase
    .from("orders")
    .update({ stripe_invoice_id: invoiceId })
    .eq("id", orderId);
  if (saveInvoiceIdError) {
    console.error(
      "[Invoice発行] stripe_invoice_id保存失敗:",
      saveInvoiceIdError
    );
    return { error: "Invoice IDの保存に失敗しました" };
  }

  // 9. Invoice 明細追加
  try {
    for (const item of items) {
      const unitPrice = item.is_negotiable
        ? (negotiablePrices.get(item.id) ?? 0)
        : (item.unit_price_snapshot ?? 0);
      await getStripe().invoiceItems.create({
        customer: stripeCustomerId,
        invoice: invoiceId,
        description: item.product_name_snapshot,
        amount: unitPrice * item.quantity,
        currency: "jpy",
      });
    }
  } catch (err) {
    console.error("[Invoice発行] Invoice明細追加失敗:", err);
    return { error: "Invoice 明細の追加に失敗しました" };
  }

  // 10. Finalize → Send
  try {
    await getStripe().invoices.finalizeInvoice(invoiceId);
    await getStripe().invoices.sendInvoice(invoiceId);
  } catch (err) {
    console.error("[Invoice発行] Invoice送付失敗:", err);
    return {
      error:
        "Invoice の送付に失敗しました。Stripe ダッシュボードで確認してください。",
    };
  }

  // 11. ステータスを invoice_sent に更新
  const { error: statusError } = await supabase
    .from("orders")
    .update({ status: "invoice_sent" })
    .eq("id", orderId);
  if (statusError) {
    // Invoice 送付済みのためエラーにしない（BRAND-65 Webhook で paid に遷移）
    console.error("[Invoice発行] status更新失敗:", statusError);
  }

  // 12. 運営者通知（メール実装は BRAND-64）
  console.log(
    `[Invoice発行] 注文ID: ${orderId} のInvoice（${invoiceId}）を送付しました`
  );

  redirect("/admin/orders");
}

// ステータス遷移マップ（線形・前進のみ）
const NEXT_STATUS: Record<string, string> = {
  paid: "sourcing",
  sourcing: "ordered",
  ordered: "preparing",
  preparing: "shipping",
  shipping: "delivered",
};

type StatusActionResult = { error: string };

export async function advanceOrderStatus(
  orderId: string,
  formData: FormData
): Promise<StatusActionResult | never> {
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  if (role !== "admin") return { error: "権限がありません" };

  const supabase = createAdminClient();

  const { data: order } = await supabase
    .from("orders")
    .select("id, status")
    .eq("id", orderId)
    .single();

  if (!order) return { error: "注文が見つかりません" };

  const nextStatus = NEXT_STATUS[order.status];
  if (!nextStatus) return { error: "これ以上ステータスを進められません" };

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      status: nextStatus as
        | "sourcing"
        | "ordered"
        | "preparing"
        | "shipping"
        | "delivered",
    })
    .eq("id", orderId);

  if (updateError) {
    console.error("[ステータス更新] 失敗:", updateError);
    return { error: "ステータスの更新に失敗しました" };
  }

  if (nextStatus === "shipping") {
    const trackingNumber = formData.get("tracking_number") as string | null;
    // 追跡番号は DB マイグレーション後に保存予定
    console.log(
      `[発送] 注文ID: ${orderId} 追跡番号: ${trackingNumber ?? "未入力"}`
    );
    // 発送通知メール（BRAND-69）
    console.log(`[発送通知メール予定] 注文ID: ${orderId}`);
  }

  if (nextStatus === "delivered") {
    // 配達完了通知メール（BRAND-69）
    console.log(`[配達完了通知メール予定] 注文ID: ${orderId}`);
  }

  redirect(`/admin/orders/${orderId}`);
}

export async function cancelOrder(
  orderId: string,
  reason: string
): Promise<StatusActionResult | void> {
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  if (role !== "admin") return { error: "権限がありません" };

  const supabase = createAdminClient();

  const { error: updateError } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId);

  if (updateError) {
    console.error("[キャンセル] 失敗:", updateError);
    return { error: "キャンセルに失敗しました" };
  }

  // キャンセル理由は DB マイグレーション後に保存予定
  console.log(`[キャンセル] 注文ID: ${orderId} 理由: ${reason}`);

  redirect("/admin/orders");
}
