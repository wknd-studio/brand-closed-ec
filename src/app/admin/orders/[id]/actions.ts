"use server";

import * as Sentry from "@sentry/nextjs";
import { requireAuth } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { cancelOrder as cancelOrderUseCase } from "@/composition/order";
import { DomainError } from "@/domain/errors/domain-error";

type ActionResult = { error: string };

async function requireAdmin(): Promise<
  { error: string } | { adminClerkUserId: string }
> {
  const { userId, sessionClaims } = await requireAuth();
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role;
  if (!userId || role !== "admin") return { error: "権限がありません" };
  return { adminClerkUserId: userId };
}

export async function cancelOrder(
  orderId: string,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  reason: string
): Promise<ActionResult | void> {
  const admin = await requireAdmin();
  if ("error" in admin) return admin;

  try {
    await cancelOrderUseCase({
      orderId,
      adminClerkUserId: admin.adminClerkUserId,
    });
  } catch (err) {
    // キャンセルできない状態等の業務ルールの違反（DomainError）は想定内の失敗のため送らない
    if (!(err instanceof DomainError))
      Sentry.captureException(err, {
        tags: { useCase: "cancelOrder" },
        extra: { orderId },
      });
    const message =
      err instanceof Error ? err.message : "キャンセルに失敗しました";
    return { error: message };
  }

  redirect("/admin/orders");
}
