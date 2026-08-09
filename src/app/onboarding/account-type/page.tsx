import { requireAuth } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import AccountTypeForm from "./account-type-form";

export default async function OnboardingAccountTypePage() {
  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <AccountTypeForm />
    </main>
  );
}
