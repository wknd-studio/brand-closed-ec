import { requireAuth } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import PlanSelector from "./plan-selector";

export default async function OnboardingPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ organizationId?: string }>;
}) {
  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  const { organizationId } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold">プランを選択してください</h1>
        <PlanSelector organizationId={organizationId} />
      </div>
    </main>
  );
}
