import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth/current-user";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { StripeOnboardingCheckoutGateway } from "@/infrastructure/stripe/stripe-onboarding-checkout-gateway";
import {
  startOnboardingCheckout,
  type StartOnboardingCheckoutResult,
} from "@/use-cases/start-onboarding-checkout";
import Link from "next/link";

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
    checkout = await startOnboardingCheckout(
      { clerkUserId: userId, email },
      {
        userRepo: new SupabaseUserRepository(createAdminClient()),
        checkoutGateway: new StripeOnboardingCheckoutGateway(),
      }
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { page: "onboarding-payment" },
      extra: { clerkUserId: userId },
    });
    console.error("[Stripe] Checkout Session 作成失敗:", err);
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="space-y-4 text-center">
          <p className="text-red-600">決済ページの準備に失敗しました。</p>
          <Link href="/onboarding/account-type" className="text-sm underline">
            プラン選択に戻る
          </Link>
        </div>
      </main>
    );
  }

  if ("redirectTo" in checkout) redirect(checkout.redirectTo);

  if (!checkout.url) {
    return (
      <main className="flex min-h-screen items-center justify-center p-8">
        <div className="space-y-4 text-center">
          <p className="text-red-600">決済ページの取得に失敗しました。</p>
          <Link href="/onboarding/account-type" className="text-sm underline">
            プラン選択に戻る
          </Link>
        </div>
      </main>
    );
  }

  redirect(checkout.url);
}
