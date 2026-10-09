"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth/current-user";
import { selectPlan as selectPlanUseCase } from "@/use-cases/select-plan";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { ClerkAccountGateway } from "@/infrastructure/clerk/clerk-account-gateway";
import { RANK_ORDER } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { InvalidPhoneNumberError } from "@/domain/errors/invalid-phone-number-error";
import { InvalidInvoiceRegistrationNumberError } from "@/domain/errors/invalid-invoice-registration-number-error";

// ENTERPRISEは個別契約のためセルフサービスの選択肢から除外する（FR-006）
const VALID_PLANS: MemberRankValue[] = RANK_ORDER.filter(
  (rank) => rank !== "enterprise"
);

export type SelectPlanResult = { redirectTo: string } | { error: string };

export async function selectPlan(
  _: SelectPlanResult | null,
  formData: FormData
): Promise<SelectPlanResult> {
  const plan = formData.get("plan") as MemberRankValue;

  if (!VALID_PLANS.includes(plan)) {
    return { error: "無効なプランです" };
  }

  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  const accountType = formData.get("accountType");
  const firstName = String(formData.get("firstName") ?? "");
  const lastName = String(formData.get("lastName") ?? "");
  const phoneNumber = String(formData.get("phoneNumber") ?? "");
  const companyNameRaw = formData.get("companyName");
  const invoiceRegistrationNumberRaw = formData.get(
    "invoiceRegistrationNumber"
  );

  if (
    accountType === "corporate" &&
    (!companyNameRaw || !invoiceRegistrationNumberRaw)
  ) {
    return { error: "会社名と適格請求書発行事業者登録番号を入力してください" };
  }

  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "";

  const db = createAdminClient();

  try {
    const result = await selectPlanUseCase(
      {
        clerkUserId: userId,
        email,
        firstName,
        lastName,
        phoneNumber,
        plan,
        companyName:
          accountType === "corporate" ? String(companyNameRaw) : undefined,
        invoiceRegistrationNumber:
          accountType === "corporate"
            ? String(invoiceRegistrationNumberRaw)
            : undefined,
      },
      {
        userRepo: new SupabaseUserRepository(db),
        accountGateway: new ClerkAccountGateway(),
      }
    );
    return result;
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      return { error: "電話番号の形式が正しくありません" };
    }
    if (error instanceof InvalidInvoiceRegistrationNumberError) {
      return {
        error: "適格請求書発行事業者登録番号の形式が正しくありません",
      };
    }
    return { error: "ユーザーレコードの作成に失敗しました" };
  }
}
