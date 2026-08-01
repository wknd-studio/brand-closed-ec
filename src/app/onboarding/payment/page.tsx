import * as Sentry from "@sentry/nextjs";
import { redirect } from "next/navigation";
import { auth, currentUser } from "@clerk/nextjs/server";
import { getStripe, STRIPE_PRICE_IDS, type PaidRank } from "@/lib/stripe";
import Link from "next/link";

const VALID_PLANS = Object.keys(STRIPE_PRICE_IDS) as PaidRank[];

export default async function OnboardingPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;

  if (!plan || !VALID_PLANS.includes(plan as PaidRank)) {
    redirect("/onboarding/plan");
  }

  const paidRank = plan as PaidRank;

  const { userId } = await auth();
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

  let session;
  try {
    session = await getStripe().checkout.sessions.create({
      mode: "subscription",
      line_items: [
        { price: STRIPE_PRICE_IDS[paidRank].monthly, quantity: 1 },
        { price: STRIPE_PRICE_IDS[paidRank].initialFee, quantity: 1 },
      ],
      customer_email: email,
      success_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/onboarding/payment/cancel?plan=${paidRank}`,
      metadata: {
        clerk_user_id: userId,
        plan: paidRank,
      },
      locale: "ja",
    });
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
          <Link href="/onboarding/plan" className="text-sm underline">
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
          <Link href="/onboarding/plan" className="text-sm underline">
            プラン選択に戻る
          </Link>
        </div>
      </main>
    );
  }

  redirect(session.url);
}
