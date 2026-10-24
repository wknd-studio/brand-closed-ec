import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth/current-user";
import { getStripe } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { StripeOnboardingCheckoutGateway } from "@/infrastructure/stripe/stripe-onboarding-checkout-gateway";
import { isOnboardingCompleted } from "./actions";
import OnboardingStatusPoller from "./onboarding-status-poller";

type Props = {
  searchParams: Promise<{ session_id?: string | string[] }>;
};

// IDの形式でない値はStripeに問い合わせずに弾く（APIのパスに任意の文字列を渡さないため）
const CHECKOUT_SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;

type CheckoutVerification = "paid" | "not_paid" | "unavailable";

/**
 * 本人のStripe Customerに有効なサブスクリプションがあるかを確かめる（GitHub issue #461）。
 * 決済画面は、有効なサブスクリプションがあるとsession_idを付けずにこの画面へ送るため
 * （start-onboarding-checkout.ts）、session_idが無くても決済済みの会員を種別選択へ
 * 戻さないようにする。判定は決済画面と同じhasActiveSubscriptionで行う
 */
async function verifyActiveSubscription(
  userId: string
): Promise<CheckoutVerification> {
  try {
    const user = await new SupabaseUserRepository(
      createAdminClient()
    ).findByClerkUserId(userId);
    if (!user?.stripeCustomerId) return "not_paid";

    const hasActive =
      await new StripeOnboardingCheckoutGateway().hasActiveSubscription(
        user.stripeCustomerId
      );
    return hasActive ? "paid" : "not_paid";
  } catch (err) {
    Sentry.captureException(err, {
      tags: { page: "onboarding-payment-success" },
      extra: { clerkUserId: userId },
    });
    console.error("[Stripe] サブスクリプションの確認に失敗:", err);
    return "unavailable";
  }
}

/**
 * URLのsession_idが、この会員の決済完了済みのCheckout Sessionかを確かめる
 * （GitHub issue #425）。決済していない会員が履歴・ブックマーク等からこの画面を
 * 開いたときに、「決済は完了しています」という事実と違う案内を出さないため。
 * 会員の照合は、決済画面がmetadataに入れているclerk_user_idで行う
 */
async function verifyCheckoutSession(
  userId: string,
  sessionId: string | string[] | undefined
): Promise<CheckoutVerification> {
  if (typeof sessionId !== "string") return "not_paid";
  if (!CHECKOUT_SESSION_ID_PATTERN.test(sessionId)) return "not_paid";

  let session;
  try {
    session = await getStripe().checkout.sessions.retrieve(sessionId);
  } catch (err) {
    // 存在しないIDは利用者の操作（URLの書き換え等）による正常系の一部として扱う
    if (
      (err as { type?: string }).type === "StripeInvalidRequestError" &&
      (err as { statusCode?: number }).statusCode === 404
    ) {
      return "not_paid";
    }
    Sentry.captureException(err, {
      tags: { page: "onboarding-payment-success" },
      extra: { clerkUserId: userId, sessionId },
    });
    console.error("[Stripe] Checkout Session 取得失敗:", err);
    return "unavailable";
  }

  if (session.metadata?.clerk_user_id !== userId) return "not_paid";
  if (session.status !== "complete") return "not_paid";
  return "paid";
}

export default async function PaymentSuccessPage({ searchParams }: Props) {
  // Webhookが先に届いていれば待たせずに進める
  if (await isOnboardingCompleted()) redirect("/shop");

  const { userId } = await requireAuth();
  if (!userId) redirect("/onboarding/account-type");

  const { session_id: sessionId } = await searchParams;
  let verification = await verifyCheckoutSession(userId, sessionId);
  if (verification === "not_paid") {
    verification = await verifyActiveSubscription(userId);
  }
  if (verification === "not_paid") redirect("/onboarding/account-type");

  if (verification === "unavailable") {
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

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <div className="max-w-sm space-y-6 text-center">
        <h1 className="text-xl font-semibold">ありがとうございます</h1>
        <OnboardingStatusPoller />
      </div>
    </main>
  );
}
