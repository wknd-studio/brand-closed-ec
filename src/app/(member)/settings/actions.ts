"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { getStripe } from "@/lib/stripe";
import type { Database } from "@/types/database.types";

type AddressType = Database["public"]["Enums"]["address_type"];
type ActionResult = { success: true } | { error: string };

export async function setDefaultAddress(
  addressId: string,
  type: AddressType
): Promise<ActionResult> {
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

export async function createAddress(formData: FormData): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { error: "認証されていません" };

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();
  if (!user) return { error: "ユーザーが見つかりません" };

  const { error } = await supabase.from("addresses").insert({
    user_id: user.id,
    type: formData.get("type") as AddressType,
    recipient_last_name: String(formData.get("recipient_last_name") ?? ""),
    recipient_first_name: String(formData.get("recipient_first_name") ?? ""),
    postal_code: String(formData.get("postal_code") ?? ""),
    prefecture: String(formData.get("prefecture") ?? ""),
    city: String(formData.get("city") ?? ""),
    address_line1: String(formData.get("address_line1") ?? ""),
    address_line2: (formData.get("address_line2") as string) || null,
    phone_number: String(formData.get("phone_number") ?? ""),
  });

  if (error) return { error: "住所の登録に失敗しました" };
  revalidatePath("/settings");
  return { success: true };
}

export async function updateAddress(
  addressId: string,
  formData: FormData
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { error: "認証されていません" };

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();
  if (!user) return { error: "ユーザーが見つかりません" };

  const { error } = await supabase
    .from("addresses")
    .update({
      recipient_last_name: String(formData.get("recipient_last_name") ?? ""),
      recipient_first_name: String(formData.get("recipient_first_name") ?? ""),
      postal_code: String(formData.get("postal_code") ?? ""),
      prefecture: String(formData.get("prefecture") ?? ""),
      city: String(formData.get("city") ?? ""),
      address_line1: String(formData.get("address_line1") ?? ""),
      address_line2: (formData.get("address_line2") as string) || null,
      phone_number: String(formData.get("phone_number") ?? ""),
    })
    .eq("id", addressId);

  if (error) return { error: "住所の更新に失敗しました" };
  revalidatePath("/settings");
  return { success: true };
}

export async function deleteAddress(addressId: string): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { error: "認証されていません" };

  const supabase = createAdminClient();
  const { data: user } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_user_id", userId)
    .single();
  if (!user) return { error: "ユーザーが見つかりません" };

  const { data: address } = await supabase
    .from("addresses")
    .select("id, type, is_default")
    .eq("id", addressId)
    .single();
  if (!address) return { error: "住所が見つかりません" };

  const { error } = await supabase
    .from("addresses")
    .delete()
    .eq("id", addressId);

  if (error) return { error: "住所の削除に失敗しました" };
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
