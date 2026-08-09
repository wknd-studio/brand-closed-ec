import { requireAuth } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import OrganizationForm from "./organization-form";

export default async function OnboardingOrganizationPage() {
  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold">法人情報を入力してください</h1>
        <OrganizationForm />
      </div>
    </main>
  );
}
