import { clerkClient } from "@clerk/nextjs/server";
import { clerk } from "@clerk/testing/playwright";
import type { Browser } from "@playwright/test";
import { getClerkUserIdByEmail } from "./clerk-test-invitation";

/**
 * 管理者のClerkユーザーを用意する。middleware・Server Actionはセッショントークンの
 * metadata.role（publicMetadata）で管理者を判定する。前回の実行が中断され
 * 削除されずに残っていれば再利用する
 */
export async function ensureAdminUser(email: string): Promise<void> {
  const existingId = await getClerkUserIdByEmail(email);
  if (existingId) return;
  const clerkApi = await clerkClient();
  await clerkApi.users.createUser({
    emailAddress: [email],
    // ログインはclerk.signInのサインイントークンで行い、パスワードは使わないので乱数でよい
    password: `E2e-${crypto.randomUUID()}`,
    skipLegalChecks: true,
    publicMetadata: { role: "admin" },
  });
}

/**
 * 管理者を用意し、会員とは別のブラウザコンテキストでログインする（closeは呼び出し側）
 */
export async function signInAsAdmin(
  browser: Browser,
  email: string,
  baseURL: string | undefined
) {
  await ensureAdminUser(email);
  // test-member の fixture で storageState（会員のログイン状態）を上書きしたテストでは、
  // browser.newContext もその状態を引き継ぐため、ログインしていない状態から始める
  const adminContext = await browser.newContext({
    baseURL,
    storageState: { cookies: [], origins: [] },
  });
  const adminPage = await adminContext.newPage();
  // clerk.signInはClerkを読み込む非保護ページで呼ぶ必要がある
  await adminPage.goto("/");
  await clerk.signIn({ page: adminPage, emailAddress: email });
  return { adminContext, adminPage };
}
