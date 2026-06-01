"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { getStripe } from "@/lib/stripe";
import type { Database } from "@/types/database.types";

type AddressType = Database["public"]["Enums"]["address_type"];
type SetDefaultResult = { success: true } | { error: string };

export async function setDefaultAddress(
  addressId: string,
  type: AddressType
): Promise<SetDefaultResult> {
  const { userId } = await auth();
  if (!userId) return { error: "認証されていません" };

  const supabase = createAdminClient();

  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();

  if (!user) return { error: "ユーザーが見つかりません" };

  const { error: resetError } = await supabase
    .from("addresses")
    .update({ is_default: false })
    .eq("user_id", user.id)
    .eq("type", type);

  if (resetError) return { error: "デフォルト住所の更新に失敗しました" };

  const { error: setError } = await supabase
    .from("addresses")
    .update({ is_default: true })
    .eq("id", addressId);

  if (setError) return { error: "デフォルト住所の更新に失敗しました" };

  revalidatePath("/settings");
  return { success: true };
}

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

  // 1. Supabase 論理削除（最優先 — サービスへのアクセスを即時遮断）
  const { error: updateError } = await supabase
    .from("users")
    .update({ deleted_at: new Date().toISOString() })
    .eq("clerk_user_id", userId);

  if (updateError) {
    console.error("[退会] Supabase 論理削除失敗:", updateError);
    return { error: "退会処理に失敗しました" };
  }

  // 2. Stripe サブスクリプション解約（有料会員のみ）
  // 失敗時は deleted_at をロールバックしてユーザーに再試行を促す
  if (user?.stripe_subscription_id && user.rank !== "free") {
    try {
      await getStripe().subscriptions.cancel(user.stripe_subscription_id);
    } catch (err) {
      console.error("[退会] Stripe 解約失敗:", err);
      await supabase
        .from("users")
        .update({ deleted_at: null })
        .eq("clerk_user_id", userId);
      return {
        error:
          "サブスクリプションの解約に失敗しました。しばらく経ってから再度お試しください。",
      };
    }
  }

  // 3. Clerk アカウント削除（失敗してもサービスアクセスは deleted_at でブロック済み）
  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
  } catch (err) {
    console.error("[退会] Clerk アカウント削除失敗:", err);
  }

  return { success: true };
}
