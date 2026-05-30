import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublic = createRouteMatcher([
  "/",
  "/welcome(.*)",
  "/sign-up(.*)",
  "/sign-in(.*)",
  "/api/webhooks/(.*)",
]);

const isOnboarding = createRouteMatcher(["/onboarding(.*)"]);

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

  const { sessionClaims } = await auth();
  const meta = sessionClaims?.metadata as
    | { onboarding_completed?: boolean; role?: string }
    | undefined;

  // admin はオンボーディング不要
  if (meta?.role === "admin") return;

  // オンボーディング未完了の一般ユーザーを /onboarding/plan へ誘導
  if (!isOnboarding(req) && meta?.onboarding_completed !== true) {
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
