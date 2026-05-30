"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { getStripe } from "@/lib/stripe";

type DeleteAccountResult = { success: true } | { error: string };

export async function deleteAccount(): Promise<DeleteAccountResult> {
  const { userId } = await auth();
  if (!userId) return { error: "認証されていません" };

  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("stripe_subscription_id, rank")
    .eq("clerk_user_id", userId)
    .single();

  // 1. Supabase 論理削除（最優先）
  const { error: updateError } = await supabase
    .from("users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("clerk_user_id", userId);

  if (updateError) {
    console.error("[退会] Supabase 論理削除失敗:", updateError);
    return { error: "退会処理に失敗しました" };
  }

  // 2. Stripe サブスクリプション解約（有料会員のみ）
  if (user?.stripe_subscription_id && user.rank !== "free") {
    try {
      await getStripe().subscriptions.cancel(user.stripe_subscription_id);
    } catch (err) {
      console.error("[退会] Stripe 解約失敗:", err);
    }
  }

  // 3. Clerk アカウント削除
  const clerk = await clerkClient();
  await clerk.users.deleteUser(userId);

  return { success: true };
}
