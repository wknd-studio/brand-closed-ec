"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";

export type SelectAccountTypeResult = { redirectTo: string };

export async function selectAccountType(
  _: SelectAccountTypeResult | null,
  formData: FormData
): Promise<SelectAccountTypeResult> {
  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  const accountType = formData.get("accountType");

  // 個人側もaccountTypeを明示して引き継ぐ。/onboarding/planは
  // accountTypeが無い・不正なアクセスを種別選択へ送り返すため、
  // 省略すると個人を選んでもプラン選択画面に到達できない
  return {
    redirectTo:
      accountType === "corporate"
        ? "/onboarding/plan?accountType=corporate"
        : "/onboarding/plan?accountType=individual",
  };
}
