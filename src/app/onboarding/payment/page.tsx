import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth/current-user";
import {
  startOnboardingCheckout,
  type StartOnboardingCheckoutResult,
} from "@/composition/onboarding";
import { CONTACT } from "@/app/legal/legal-notice";
import {
  PaymentResultIcon,
  PaymentResultLayout,
  PaymentResultText,
  PaymentResultTitle,
  RestartApplicationLink,
} from "@/app/onboarding/payment/payment-result";

export default async function OnboardingPaymentPage() {
  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  let user;
  try {
    user = await currentUser();
  } catch (err) {
    // 有効なセッション（JWT）は残っているが、Clerk上のUser自体が
    // 既に削除されているケース（退会直後の古いタブ等）。
    Sentry.captureException(err, {
      tags: { page: "onboarding-payment" },
      extra: { clerkUserId: userId },
    });
    redirect("/sign-in");
  }
  const email = user?.emailAddresses[0]?.emailAddress;

  // 請求するランクはURLではなくselectPlanで保存した登録内容から決め
  // （resolve-onboarding-checkout.ts参照）、会員ごとに1つのStripe Customerで
  // 決済させる（start-onboarding-checkout.ts参照）
  let checkout: StartOnboardingCheckoutResult;
  try {
    checkout = await startOnboardingCheckout({ clerkUserId: userId, email });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { page: "onboarding-payment" },
      extra: { clerkUserId: userId },
    });
    console.error("[Stripe] Checkout Session 作成失敗:", err);
    return <PrepareFailed />;
  }

  if ("redirectTo" in checkout) redirect(checkout.redirectTo);

  if (!checkout.url) {
    return <PrepareFailed />;
  }

  redirect(checkout.url);
}

// Checkout Session を作れなかった・URLが無かったときは決済画面へ進んでいないため、料金は発生していない
function PrepareFailed() {
  return (
    <PaymentResultLayout>
      <PaymentResultIcon kind="alert" />
      <PaymentResultTitle>決済画面を開けませんでした</PaymentResultTitle>
      <PaymentResultText>
        決済ページの準備に失敗しました。料金は発生していません。
        <br />
        時間をおいて、もう一度お試しください。
      </PaymentResultText>
      <RestartApplicationLink
        note={
          <>
            続けて失敗する場合は、
            <a href={`mailto:${CONTACT.email.text}`} className="underline">
              お問い合わせ
            </a>
            ください
          </>
        }
      />
    </PaymentResultLayout>
  );
}
