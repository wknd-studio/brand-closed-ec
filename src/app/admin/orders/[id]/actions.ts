"use server";

import { requireAuth } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { cancelOrder as cancelOrderUseCase } from "@/composition/order";

type ActionResult = { error: string };

async function requireAdmin(): Promise<{ error: string } | null> {
  const { sessionClaims } = await requireAuth();
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  if (role !== "admin") return { error: "権限がありません" };
  return null;
}

export async function cancelOrder(
  orderId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reason: string
): Promise<ActionResult | void> {
  const authError = await requireAdmin();
  if (authError) return authError;

  try {
    await cancelOrderUseCase({ orderId });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "キャンセルに失敗しました";
    return { error: message };
  }

  redirect("/admin/orders");
}
