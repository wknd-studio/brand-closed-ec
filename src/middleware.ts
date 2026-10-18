import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const isPublic = createRouteMatcher([
  "/",
  "/sign-up(.*)",
  "/sign-in(.*)",
  "/waitlist(.*)",
  "/withdrawn",
  "/legal/(.*)",
  "/api/webhooks/(.*)",
]);

const isOnboarding = createRouteMatcher(["/onboarding(.*)"]);
// 決済完了画面は入会の確定をServer Action（このパスへのPOST）で確認し、確定したら
// 自分で /shop へ進めるため、入会済みでもリダイレクトしない
const isPaymentSuccess = createRouteMatcher(["/onboarding/payment/success"]);
const isAdmin = createRouteMatcher(["/admin(.*)"]);

// Stripe/Clerk webhook はレート制限対象外
const isWebhook = createRouteMatcher(["/api/webhooks/(.*)"]);

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export default clerkMiddleware(async (auth, req) => {
  if (!isWebhook(req)) {
    const { env } = await getCloudflareContext({ async: true });
    if (env.RATE_LIMITER) {
      const ip =
        req.headers.get("cf-connecting-ip") ??
        req.headers.get("x-forwarded-for")?.split(",")[0] ??
        "unknown";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response("Too Many Requests", { status: 429 });
      }
    }
  }

  if (isPublic(req)) return;

  // API ルートは sign-in へのリダイレクトではなく 401 を返す
  if (req.nextUrl.pathname.startsWith("/api/")) {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return;
  }

  await auth.protect();

  const { userId, sessionClaims } = await auth();
  const meta = sessionClaims?.metadata as
    | { onboarding_completed?: boolean; role?: string }
    | undefined;

  // admin は /admin 以下に強制リダイレクト
  if (meta?.role === "admin") {
    if (!isAdmin(req)) {
      return NextResponse.redirect(new URL("/admin", req.url));
    }
    return;
  }
  // deleted_at は JWT に反映されないため常に DB で確認する。
  // clerk_user_id の一意制約は deleted_at IS NULL の部分インデックスのため、退会済み行と
  // 有効な行が併存しうる。有効な行を優先し、無ければ退会済み行を取る
  const { data } = await supabaseAdmin()
    .from("users")
    .select("onboarding_completed, deleted_at")
    .eq("clerk_user_id", userId!)
    .order("deleted_at", { ascending: false, nullsFirst: true })
    .limit(1)
    .maybeSingle();

  if (data?.deleted_at) {
    return NextResponse.redirect(new URL("/withdrawn", req.url));
  }

  // 入会済みの会員がオンボーディングから送信・決済すると、プランや会員種別の上書き、
  // サブスクリプションの二重作成が起きるため、オンボーディングに入れない
  if (isOnboarding(req)) {
    if (data?.onboarding_completed && !isPaymentSuccess(req)) {
      return NextResponse.redirect(new URL("/shop", req.url));
    }
    return;
  }

  if (!data?.onboarding_completed) {
    return NextResponse.redirect(new URL("/onboarding/account-type", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
