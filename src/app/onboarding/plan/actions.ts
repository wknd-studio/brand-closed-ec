"use server";

import { redirect } from "next/navigation";
import { auth, clerkClient, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";

const TERMS_VERSION = "2026-05-25";

type MemberRank = "free" | "entry" | "standard" | "pro";

export async function selectPlan(formData: FormData) {
  const plan = formData.get("plan") as MemberRank;

  const validPlans: MemberRank[] = ["free", "entry", "standard", "pro"];
  if (!validPlans.includes(plan)) {
    throw new Error("invalid plan");
  }

  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const user = await currentUser();
  const email = user?.emailAddresses[0]?.emailAddress ?? "";
  const firstName = user?.firstName ?? "";
  const lastName = user?.lastName ?? "";

  const isFree = plan === "free";
  const supabase = createAdminClient();

  const { data: userRecord, error: userError } = await supabase
    .from("users")
    .upsert(
      {
        clerk_user_id: userId,
        email,
        first_name: firstName,
        last_name: lastName,
        rank: plan,
        terms_agreed_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
        onboarding_completed: isFree,
      },
      { onConflict: "clerk_user_id" }
    )
    .select("id")
    .single();

  if (userError || !userRecord) {
    throw new Error("ユーザーレコードの作成に失敗しました");
  }

  const clerk = await clerkClient();
  await clerk.users.updateUserMetadata(userId, {
    publicMetadata: { onboarding_completed: isFree },
  });

  if (isFree) {
    redirect("/shop");
  } else {
    redirect(`/onboarding/payment?plan=${plan}`);
  }
}
