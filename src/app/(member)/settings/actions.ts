"use server";

import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { withdraw } from "@/use-cases/withdraw";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { StripeSubscriptionGateway } from "@/infrastructure/stripe/stripe-subscription-gateway";
import { ClerkAccountGateway } from "@/infrastructure/clerk/clerk-account-gateway";
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

  const type = formData.get("type") as AddressType;

  const { count } = await supabase
    .from("addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("type", type);

  const isFirst = (count ?? 0) === 0;

  const { error } = await supabase.from("addresses").insert({
    user_id: user.id,
    type,
    recipient_last_name: String(formData.get("recipient_last_name") ?? ""),
    recipient_first_name: String(formData.get("recipient_first_name") ?? ""),
    postal_code: String(formData.get("postal_code") ?? ""),
    prefecture: String(formData.get("prefecture") ?? ""),
    city: String(formData.get("city") ?? ""),
    address_line1: String(formData.get("address_line1") ?? ""),
    address_line2: (formData.get("address_line2") as string) || null,
    phone_number: String(formData.get("phone_number") ?? ""),
    is_default: isFirst,
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

  try {
    await withdraw(
      { clerkUserId: userId },
      {
        userRepo: new SupabaseUserRepository(),
        subscriptionGateway: new StripeSubscriptionGateway(),
        accountGateway: new ClerkAccountGateway(),
      }
    );
    return { success: true };
  } catch {
    return { error: "退会処理に失敗しました" };
  }
}
