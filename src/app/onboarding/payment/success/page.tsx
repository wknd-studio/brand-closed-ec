import { redirect } from "next/navigation";
import { isOnboardingCompleted } from "./actions";
import OnboardingStatusPoller from "./onboarding-status-poller";

export default async function PaymentSuccessPage() {
  // Webhookが先に届いていれば待たせずに進める
  if (await isOnboardingCompleted()) redirect("/shop");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-sm space-y-6 text-center">
        <h1 className="text-xl font-semibold">ありがとうございます</h1>
        <OnboardingStatusPoller />
      </div>
    </main>
  );
}
