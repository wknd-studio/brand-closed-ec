"use server";

import { requireAuth } from "@/lib/auth/current-user";
import { memberQueryService } from "@/composition/member-query";

// 入会の確定はStripe Webhook（checkout.session.completed）に一本化している
// （docs/signup-flow.md 設計決定事項#5）。決済完了画面はここで確定済みかを
// 確認するだけで、自ら確定処理は行わない
export async function isOnboardingCompleted(): Promise<boolean> {
  const { userId } = await requireAuth();
  if (!userId) return false;

  return (await memberQueryService()).findOnboardingCompleted(userId);
}
