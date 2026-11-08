"use server";

import { requireAuth } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/server-admin";

// 入会の確定はStripe Webhook（checkout.session.completed）に一本化している
// （docs/signup-flow.md 設計決定事項#5）。決済完了画面はここで確定済みかを
// 確認するだけで、自ら確定処理は行わない
export async function isOnboardingCompleted(): Promise<boolean> {
  const { userId } = await requireAuth();
  if (!userId) return false;

  const { data, error } = await createAdminClient()
    .from("users")
    .select("onboarding_completed")
    .eq("clerk_user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`入会状態の取得に失敗しました: ${error.message}`);

  return data?.onboarding_completed ?? false;
}
