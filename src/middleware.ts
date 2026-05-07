import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// 唯一の公開ルート：招待コード入力ページのみ
const isPublicRoute = createRouteMatcher(["/invite(.*)"]);

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
    const { userId } = await auth();
    if (!userId) {
      // 未認証はHTMLを返さず404（クローズド環境の担保）
      return new NextResponse(null, { status: 404 });
    }
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)", "/(api|trpc)(.*)"],
};
