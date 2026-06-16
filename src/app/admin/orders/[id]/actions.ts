"use server";

import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { issueInvoice as issueInvoiceUseCase } from "@/use-cases/issue-invoice";
import { advanceOrderStatus as advanceOrderStatusUseCase } from "@/use-cases/advance-order-status";
import { cancelOrder as cancelOrderUseCase } from "@/use-cases/cancel-order";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { StripePaymentGateway } from "@/infrastructure/stripe/stripe-payment-gateway";
import { ResendNotificationService } from "@/infrastructure/resend/resend-notification-service";

type ActionResult = { error: string };

async function requireAdmin(): Promise<{ error: string } | null> {
  const { sessionClaims } = await auth();
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  if (role !== "admin") return { error: "権限がありません" };
  return null;
}

export async function issueInvoice(
  orderId: string,
  formData: FormData
): Promise<ActionResult | never> {
  const authError = await requireAdmin();
  if (authError) return authError;

  const orderRepo = new SupabaseOrderRepository(createAdminClient());

  const order = await orderRepo.findById(orderId);
  if (!order) return { error: "注文が見つかりません" };

  const negotiatedPrices: Record<string, number> = {};
  const negotiableItems = order.items.filter((i) => i.isNegotiable);
  for (const item of negotiableItems) {
    const raw = formData.get(`price_${item.id}`);
    const price = Number(raw);
    if (!raw || isNaN(price) || price <= 0) {
      return {
        error: `「${item.productNameSnapshot}」の価格を入力してください`,
      };
    }
    negotiatedPrices[item.id] = price;
  }

  const result = await issueInvoiceUseCase(
    { orderId, negotiatedPrices },
    {
      orderRepo,
      userRepo: new SupabaseUserRepository(createAdminClient()),
      paymentGateway: new StripePaymentGateway(),
      notificationService: new ResendNotificationService(),
    }
  );

  if ("limitExceeded" in result) {
    return {
      error: `月次仕入れ上限を超えるため発行できません。会員に通知しました。`,
    };
  }

  redirect("/admin/orders");
}

export async function advanceOrderStatus(
  orderId: string
): Promise<ActionResult | never> {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    await advanceOrderStatusUseCase(
      { orderId },
      {
        orderRepo: new SupabaseOrderRepository(createAdminClient()),
        userRepo: new SupabaseUserRepository(createAdminClient()),
        notificationService: new ResendNotificationService(),
      }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "ステータスの更新に失敗しました";
    return { error: message };
  }

  redirect(`/admin/orders/${orderId}`);
}

export async function cancelOrder(
  orderId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reason: string
): Promise<ActionResult | void> {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    await cancelOrderUseCase(
      { orderId },
      { orderRepo: new SupabaseOrderRepository(createAdminClient()) }
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "キャンセルに失敗しました";
    return { error: message };
  }

  redirect("/admin/orders");
}
