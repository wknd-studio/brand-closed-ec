import { requireAuth } from "@/lib/auth/current-user";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/eyebrow";
import { Heading } from "@/components/ui/heading";
import { Steps } from "@/components/ui/steps";
import { ONBOARDING_STEPS } from "@/app/onboarding/onboarding-steps";
import AccountTypeForm from "./account-type-form";

export default async function OnboardingAccountTypePage() {
  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  return (
    <main className="flex flex-1 justify-center px-4 pt-10 pb-18">
      <div className="flex w-full max-w-[680px] flex-col gap-7">
        <Steps steps={ONBOARDING_STEPS} current={0} />
        <Card className="flex flex-col gap-7 rounded-3xl p-[clamp(24px,5vw,40px)]">
          <div className="flex flex-col gap-2.5">
            <Eyebrow withLine>STEP 1 / {ONBOARDING_STEPS.length}</Eyebrow>
            <Heading as="h1" level="compact">
              ご利用の種別を選んでください
            </Heading>
            <p className="text-sm leading-[1.8] text-secondary">
              選んだ種別によって、次の画面で入力していただく項目が変わります。
            </p>
          </div>
          <AccountTypeForm />
        </Card>
      </div>
    </main>
  );
}
