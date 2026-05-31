import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const isPublic = createRouteMatcher([
  "/",
  "/welcome(.*)",
  "/sign-up(.*)",
  "/sign-in(.*)",
  "/withdrawn",
  "/api/webhooks/(.*)",
]);

const isOnboarding = createRouteMatcher(["/onboarding(.*)"]);

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export default clerkMiddleware(async (auth, req) => {
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

  // admin はオンボーディング不要
  if (meta?.role === "admin") return;
  if (isOnboarding(req)) return;

  // JWT 高速パス: トークンが最新であれば DB クエリ不要
  if (meta?.onboarding_completed === true) return;

  // JWT が古いか未更新の場合は DB を正とする
  const { data } = await supabaseAdmin()
    .from("users")
    .select("onboarding_completed, deleted_at")
    .eq("clerk_user_id", userId!)
    .single();

  if (data?.deleted_at) {
    return NextResponse.redirect(new URL("/withdrawn", req.url));
  }

  if (!data?.onboarding_completed) {
    return NextResponse.redirect(new URL("/onboarding/plan", req.url));
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
    "/__clerk/(.*)",
  ],
};
