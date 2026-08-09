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

const TERMS_VERSION = "2026-05-25";

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

  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "";
  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";

  const db = createAdminClient();

  try {
    const result = await selectPlanUseCase(
      {
        clerkUserId: userId,
        email,
        firstName,
        lastName,
        plan,
        termsVersion: TERMS_VERSION,
        organizationId: organizationId ? String(organizationId) : undefined,
      },
      {
        userRepo: new SupabaseUserRepository(db),
        accountGateway: new ClerkAccountGateway(),
        organizationRepo: new SupabaseOrganizationRepository(db),
      }
    );
    return result;
  } catch {
    return { error: "ユーザーレコードの作成に失敗しました" };
  }
}
