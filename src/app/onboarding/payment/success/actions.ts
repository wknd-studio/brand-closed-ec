"use server";

import { requireAuth } from "@/lib/auth/current-user";
import { memberStatusQueryService } from "@/composition/member-status-query";

// 入会の確定はStripe Webhook（checkout.session.completed）に一本化している
// （docs/signup-flow.md 設計決定事項#5）。決済完了画面はここで確定済みかを
// 確認するだけで、自ら確定処理は行わない。会員の状態は middleware と同じ Query Service で読む
export async function isOnboardingCompleted(): Promise<boolean> {
  const { userId } = await requireAuth();
  if (!userId) return false;

  const status = await memberStatusQueryService().findMemberStatus(userId);
  return status !== null && status.onboardingCompleted && !status.withdrawn;
}
