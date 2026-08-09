"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth/current-user";
import { selectPlan as selectPlanUseCase } from "@/use-cases/select-plan";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { SupabaseOrganizationRepository } from "@/infrastructure/supabase/supabase-organization-repository";
import { ClerkAccountGateway } from "@/infrastructure/clerk/clerk-account-gateway";
import { RANK_ORDER } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { InvalidPhoneNumberError } from "@/domain/errors/invalid-phone-number-error";

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

  const organizationId = formData.get("organizationId");
  // 法人フローでは代表者の氏名・電話番号は/onboarding/organizationで
  // 既に収集済み（create-organization.ts側でusersへ反映される）ため、
  // ここでは個人フローの場合のみフォーム入力値を使う
  const firstName = String(formData.get("firstName") ?? "");
  const lastName = String(formData.get("lastName") ?? "");
  const phoneNumber = String(formData.get("phoneNumber") ?? "");

  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "";
  const legalAcceptedAt = user?.legalAcceptedAt
    ? new Date(user.legalAcceptedAt)
    : null;

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
        legalAcceptedAt,
        organizationId: organizationId ? String(organizationId) : undefined,
      },
      {
        userRepo: new SupabaseUserRepository(db),
        accountGateway: new ClerkAccountGateway(),
        organizationRepo: new SupabaseOrganizationRepository(db),
      }
    );
    return result;
  } catch (error) {
    if (error instanceof InvalidPhoneNumberError) {
      return { error: "電話番号の形式が正しくありません" };
    }
    return { error: "ユーザーレコードの作成に失敗しました" };
  }
}
