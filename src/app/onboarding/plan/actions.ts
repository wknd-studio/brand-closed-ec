"use server";

import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { selectPlan as selectPlanUseCase } from "@/use-cases/select-plan";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { ClerkAccountGateway } from "@/infrastructure/clerk/clerk-account-gateway";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";

const TERMS_VERSION = "2026-05-25";

const VALID_PLANS: MemberRankValue[] = ["free", "entry", "standard", "pro"];

export type SelectPlanResult = { redirectTo: string } | { error: string };

export async function selectPlan(
  _: SelectPlanResult | null,
  formData: FormData
): Promise<SelectPlanResult> {
  const plan = formData.get("plan") as MemberRankValue;

  if (!VALID_PLANS.includes(plan)) {
    return { error: "無効なプランです" };
  }

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "";
  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";

  try {
    const result = await selectPlanUseCase(
      {
        clerkUserId: userId,
        email,
        firstName,
        lastName,
        plan,
        termsVersion: TERMS_VERSION,
      },
      {
        userRepo: new SupabaseUserRepository(createAdminClient()),
        accountGateway: new ClerkAccountGateway(),
      }
    );
    return result;
  } catch {
    return { error: "ユーザーレコードの作成に失敗しました" };
  }
}
