"use server";

import * as Sentry from "@sentry/nextjs";
import { revalidatePath } from "next/cache";
import { requireAuth } from "@/lib/auth/current-user";
import { requestReturn } from "@/composition/return-request";
import {
  InvalidReturnRequestError,
  type InvalidReturnRequestReason,
} from "@/domain/errors/invalid-return-request-error";
import { ReturnOrderNotFoundError } from "@/domain/errors/return-order-not-found-error";

export type ReturnRequestFormResult = { success: true } | { error: string };

const INVALID_REQUEST_MESSAGES: Record<InvalidReturnRequestReason, string> = {
  no_items: "返品する商品の数量を選んでください",
  invalid_quantity: "数量を選び直してください",
  duplicate_item: "数量を選び直してください",
  item_not_returnable:
    "申請できない商品が含まれています。画面を再読み込みしてください",
  quantity_exceeded:
    "ご注文の数量を超えて申請することはできません。画面を再読み込みしてください",
  reason_required:
    "理由を選んでください（「その他」の場合は詳しい理由もご記入ください）",
};

// 明細ごとの数量は quantity:<明細ID> で送る。0（返品しない明細）は申請に含めない
function readItems(formData: FormData) {
  return [...formData.entries()].flatMap(([key, value]) =>
    key.startsWith("quantity:") && String(value) !== "0"
      ? [
          {
            orderItemId: key.slice("quantity:".length),
            quantity: Number(value),
          },
        ]
      : []
  );
}

export async function requestReturnAction(
  orderId: string,
  formData: FormData
): Promise<ReturnRequestFormResult> {
  const { userId } = await requireAuth();
  if (!userId) return { error: "認証されていません" };

  try {
    await requestReturn({
      clerkUserId: userId,
      orderId,
      items: readItems(formData),
      reasonKind: String(formData.get("reason_kind") ?? ""),
      reasonDetail: String(formData.get("reason_detail") ?? ""),
    });
    revalidatePath(`/orders/${orderId}`);
    return { success: true };
  } catch (err) {
    // 入力に起因する想定内の失敗は Sentry に送らない
    if (err instanceof InvalidReturnRequestError) {
      return { error: INVALID_REQUEST_MESSAGES[err.reason] };
    }
    if (err instanceof ReturnOrderNotFoundError) {
      return { error: "注文が見つかりません" };
    }
    Sentry.captureException(err, { tags: { useCase: "requestReturn" } });
    return { error: "返品・返金の申請に失敗しました" };
  }
}
