import { requireAuth } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import PlanSelector from "./plan-selector";

export default async function OnboardingPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ accountType?: string }>;
}) {
  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  const { accountType } = await searchParams;

  // member_typeが確定するのはこの画面の送信時（それ以前はusersの行がまだ
  // 無く、member_type='corporate'はcompany_name必須のCHECK制約があるため
  // 会社名の入力前には保存できない）。そのため個人/法人の選択は
  // クエリパラメータだけで引き継いでおり、クエリが欠けたまま表示すると
  // 「法人として登録」を選んだ会員でも法人情報の入力欄が消え、個人として
  // 登録されてしまう。欠落・不正な場合は種別選択をやり直させる
  if (accountType !== "individual" && accountType !== "corporate") {
    redirect("/onboarding/account-type");
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="w-full max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold">プランを選択してください</h1>
        <PlanSelector isCorporate={accountType === "corporate"} />
      </div>
    </main>
  );
}
