"use server";

import { requireAuth } from "@/lib/auth/current-user";
import { revalidatePath } from "next/cache";
import { withdraw } from "@/composition/member";
import { ActiveOrdersExistError } from "@/domain/errors/active-orders-exist-error";
import {
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from "@/composition/address";
import type { AddressType } from "@/domain/entities/address";

type ActionResult = { success: true } | { error: string };

export async function setDefaultAddressAction(
  addressId: string,
  type: AddressType
): Promise<ActionResult> {
  const { userId } = await requireAuth();
  if (!userId) return { error: "認証されていません" };

  try {
    await setDefaultAddress({ clerkUserId: userId, addressId, type });
    revalidatePath("/settings");
    return { success: true };
  } catch {
    return { error: "デフォルト住所の更新に失敗しました" };
  }
}

export async function createAddressAction(
  formData: FormData
): Promise<ActionResult> {
  const { userId } = await requireAuth();
  if (!userId) return { error: "認証されていません" };

  try {
    await createAddress({
      clerkUserId: userId,
      type: formData.get("type") as AddressType,
      recipientLastName: String(formData.get("recipient_last_name") ?? ""),
      recipientFirstName: String(formData.get("recipient_first_name") ?? ""),
      postalCode: String(formData.get("postal_code") ?? ""),
      prefecture: String(formData.get("prefecture") ?? ""),
      city: String(formData.get("city") ?? ""),
      addressLine1: String(formData.get("address_line1") ?? ""),
      addressLine2: (formData.get("address_line2") as string) || null,
      phoneNumber: String(formData.get("phone_number") ?? ""),
    });
    revalidatePath("/settings");
    return { success: true };
  } catch {
    return { error: "住所の登録に失敗しました" };
  }
}

export async function updateAddressAction(
  addressId: string,
  formData: FormData
): Promise<ActionResult> {
  const { userId } = await requireAuth();
  if (!userId) return { error: "認証されていません" };

  try {
    await updateAddress({
      addressId,
      recipientLastName: String(formData.get("recipient_last_name") ?? ""),
      recipientFirstName: String(formData.get("recipient_first_name") ?? ""),
      postalCode: String(formData.get("postal_code") ?? ""),
      prefecture: String(formData.get("prefecture") ?? ""),
      city: String(formData.get("city") ?? ""),
      addressLine1: String(formData.get("address_line1") ?? ""),
      addressLine2: (formData.get("address_line2") as string) || null,
      phoneNumber: String(formData.get("phone_number") ?? ""),
    });
    revalidatePath("/settings");
    return { success: true };
  } catch {
    return { error: "住所の更新に失敗しました" };
  }
}

export async function deleteAddressAction(
  addressId: string
): Promise<ActionResult> {
  const { userId } = await requireAuth();
  if (!userId) return { error: "認証されていません" };

  try {
    await deleteAddress({ addressId });
    revalidatePath("/settings");
    return { success: true };
  } catch {
    return { error: "住所の削除に失敗しました" };
  }
}

type DeleteAccountResult = { success: true } | { error: string };

export async function deleteAccount(): Promise<DeleteAccountResult> {
  const { userId } = await requireAuth();
  if (!userId) return { error: "認証されていません" };

  try {
    await withdraw({ clerkUserId: userId });
    return { success: true };
  } catch (err) {
    if (err instanceof ActiveOrdersExistError) {
      return { error: "進行中の注文があるため退会できません" };
    }
    return { error: "退会処理に失敗しました" };
  }
}
