import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import PlanSelector from "./plan-selector";

export default async function OnboardingPlanPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold">プランを選択してください</h1>
        <PlanSelector />
      </div>
    </main>
  );
}
