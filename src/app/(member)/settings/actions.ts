"use server";

import * as Sentry from "@sentry/nextjs";
import { requireAuth } from "@/lib/auth/current-user";
import { revalidatePath } from "next/cache";
import { withdraw } from "@/composition/member";
import { ActiveOrdersExistError } from "@/domain/errors/active-orders-exist-error";
import { DomainError } from "@/domain/errors/domain-error";
import {
  MissingRequiredAddressFieldsError,
  type RequiredAddressField,
} from "@/domain/errors/missing-required-address-fields-error";
import { InvalidPostalCodeError } from "@/domain/errors/invalid-postal-code-error";
import { InvalidPhoneNumberError } from "@/domain/errors/invalid-phone-number-error";
import {
  createAddress,
  updateAddress,
  deleteAddress,
  setDefaultAddress,
} from "@/composition/address";
import type { AddressType } from "@/domain/entities/address";

type ActionResult = { success: true } | { error: string };

// フォームの項目名に合わせる（address-form.tsx）
const REQUIRED_ADDRESS_FIELD_LABELS: Record<RequiredAddressField, string> = {
  recipientLastName: "宛名（姓）",
  recipientFirstName: "宛名（名）",
  postalCode: "郵便番号",
  prefecture: "都道府県",
  city: "市区町村",
  addressLine1: "番地・建物名",
  phoneNumber: "電話番号",
};

/** 住所の入力値の検証エラーなら、どの項目が不正かが分かる文言を返す。それ以外は null */
function addressInputErrorMessage(err: unknown): string | null {
  if (err instanceof MissingRequiredAddressFieldsError) {
    const labels = err.fields.map((f) => REQUIRED_ADDRESS_FIELD_LABELS[f]);
    return `次の項目を入力してください: ${labels.join("、")}`;
  }
  if (err instanceof InvalidPostalCodeError) {
    return "郵便番号は7桁の数字で入力してください（ハイフンは任意。例: 150-0001）";
  }
  if (err instanceof InvalidPhoneNumberError) {
    return "電話番号は0から始まる10〜11桁の数字で入力してください（ハイフンは任意）";
  }
  return null;
}

// 住所の操作の catch では、業務ルールの違反（DomainError）は入力に起因する想定内の失敗のため Sentry には送らない
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
  } catch (err) {
    if (!(err instanceof DomainError))
      Sentry.captureException(err, { tags: { useCase: "setDefaultAddress" } });
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
  } catch (err) {
    const inputError = addressInputErrorMessage(err);
    if (inputError) return { error: inputError };
    if (!(err instanceof DomainError))
      Sentry.captureException(err, { tags: { useCase: "createAddress" } });
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
  } catch (err) {
    const inputError = addressInputErrorMessage(err);
    if (inputError) return { error: inputError };
    if (!(err instanceof DomainError))
      Sentry.captureException(err, { tags: { useCase: "updateAddress" } });
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
  } catch (err) {
    if (!(err instanceof DomainError))
      Sentry.captureException(err, { tags: { useCase: "deleteAddress" } });
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
    Sentry.captureException(err, { tags: { useCase: "withdraw" } });
    return { error: "退会処理に失敗しました" };
  }
}
