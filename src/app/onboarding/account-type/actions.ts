"use server";

import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";

export async function selectAccountType(formData: FormData): Promise<void> {
  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  const accountType = formData.get("accountType");

  if (accountType === "organization") {
    redirect("/onboarding/organization");
  }
  redirect("/onboarding/plan");
}
