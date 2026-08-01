import { auth } from "@clerk/nextjs/server";
import * as Sentry from "@sentry/nextjs";

// Sentryはリクエストスコープを自動分離するため、通常のリクエスト処理中
// （middleware.ts以外）であればどこで呼んでもそのリクエストだけに閉じる。
// 各Server Action・use-caseで個別にsetUserを呼ぶ代わりに、既存の
// auth()呼び出し箇所をこの関数に置き換えることで一元化する。
// 詳細はdocs/ai-prompts/sentry.mdを参照。
export async function requireAuth(): Promise<{ userId: string | null }> {
  const { userId } = await auth();
  if (userId) Sentry.setUser({ id: userId });
  return { userId };
}
