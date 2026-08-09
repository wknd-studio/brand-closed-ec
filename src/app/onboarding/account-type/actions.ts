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

  return {
    redirectTo:
      accountType === "organization"
        ? "/onboarding/organization"
        : "/onboarding/plan",
  };
}
