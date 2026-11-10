import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import { memberStatusQueryService } from "@/composition/member-status-query";
import type { MemberStatusDto } from "@/queries/member-status-query-service";

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

// 取得に失敗したときは、Query Service に移す前（エラーを見ずに行が無い会員として扱っていた）と
// 同じ振る舞いを保つため null を返し、Sentry に送る。環境変数が無いときは前と同じく例外を投げる
async function findMemberStatus(
  clerkUserId: string
): Promise<MemberStatusDto | null> {
  const queryService = memberStatusQueryService();
  try {
    return await queryService.findMemberStatus(clerkUserId);
  } catch (err) {
    Sentry.captureException(err, { tags: { middleware: "member-status" } });
    console.error("[middleware] 会員の状態の取得に失敗:", err);
    return null;
  }
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
  // deleted_at は JWT に反映されないため常に DB で確認する
  const status = await findMemberStatus(userId!);

  if (status?.withdrawn) {
    return NextResponse.redirect(new URL("/withdrawn", req.url));
  }

  // 入会済みの会員がオンボーディングから送信・決済すると、プランや会員種別の上書き、
  // サブスクリプションの二重作成が起きるため、オンボーディングに入れない
  if (isOnboarding(req)) {
    if (status?.onboardingCompleted && !isPaymentSuccess(req)) {
      return NextResponse.redirect(new URL("/shop", req.url));
    }
    return;
  }

  if (!status?.onboardingCompleted) {
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
