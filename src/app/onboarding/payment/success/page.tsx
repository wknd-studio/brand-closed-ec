import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { onboardingPaymentQueryService } from "@/composition/onboarding-payment-query";
import { isOnboardingCompleted } from "./actions";
import OnboardingStatusPoller from "./onboarding-status-poller";

type Props = {
  searchParams: Promise<{ session_id?: string | string[] }>;
};

export default async function PaymentSuccessPage({ searchParams }: Props) {
  // Webhookが先に届いていれば待たせずに進める
  if (await isOnboardingCompleted()) redirect("/shop");

  const { userId } = await requireAuth();
  if (!userId) redirect("/onboarding/account-type");

  const { session_id } = await searchParams;
  // 複数指定された session_id は使わない（有効なサブスクリプションの確認だけで判定する）
  const sessionId = typeof session_id === "string" ? session_id : null;

  let paymentCompleted: boolean;
  try {
    paymentCompleted = await (
      await onboardingPaymentQueryService()
    ).findPaymentCompleted({ clerkUserId: userId, sessionId });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { page: "onboarding-payment-success" },
      extra: { clerkUserId: userId, sessionId },
    });
    console.error("[決済完了画面] 決済状況の確認に失敗:", err);
    // 決済が完了しているかを確かめられないため、確定待ちも種別選択（再決済）への
    // 導線も出さず、再読み込みを促す
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="max-w-sm space-y-4 text-center">
          <p className="text-red-600">決済状況の確認に失敗しました。</p>
          <p className="text-sm text-gray-500">
            時間をおいて、このページを再読み込みしてください。
          </p>
        </div>
      </main>
    );
  }
  if (!paymentCompleted) redirect("/onboarding/account-type");

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-sm space-y-6 text-center">
        <h1 className="text-xl font-semibold">ありがとうございます</h1>
        <OnboardingStatusPoller />
      </div>
    </main>
  );
}
