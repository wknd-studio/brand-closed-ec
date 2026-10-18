import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { currentUser } from "@clerk/nextjs/server";
import { requireAuth } from "@/lib/auth/current-user";
import { getStripe, STRIPE_PRICE_IDS } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { resolveOnboardingCheckout } from "@/use-cases/resolve-onboarding-checkout";
import Link from "next/link";

export default async function OnboardingPaymentPage() {
  const { userId } = await requireAuth();
  if (!userId) redirect("/sign-in");

  // 請求するランクはURLではなくselectPlanで保存した登録内容から決める
  // （resolve-onboarding-checkout.ts参照）
  const checkout = await resolveOnboardingCheckout(userId, {
    userRepo: new SupabaseUserRepository(createAdminClient()),
  });
  if ("redirectTo" in checkout) redirect(checkout.redirectTo);

  const paidRank = checkout.rank;

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

  let session;
  try {
    session = await getStripe().checkout.sessions.create(
      {
        mode: "subscription",
        line_items: [
          { price: STRIPE_PRICE_IDS[paidRank].monthly, quantity: 1 },
          { price: STRIPE_PRICE_IDS[paidRank].initialFee, quantity: 1 },
        ],
        customer_email: email,
        success_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/payment/cancel`,
        metadata: {
          clerk_user_id: userId,
          plan: paidRank,
        },
        locale: "ja",
      },
      {
        // 退会後に同じClerkユーザーで再登録しても前回のセッションを返さないよう、
        // Clerkのユーザーではなくusersの行とランクで一意にする
        idempotencyKey: `onboarding-checkout-session-${checkout.userId}-${paidRank}`,
      }
    );
  } catch (err) {
    Sentry.captureException(err, {
      tags: { page: "onboarding-payment" },
      extra: { clerkUserId: userId, plan: paidRank },
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

  if (!session.url) {
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

  redirect(session.url);
}
