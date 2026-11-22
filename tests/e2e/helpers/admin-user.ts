import { clerkClient } from "@clerk/nextjs/server";
import { clerk } from "@clerk/testing/playwright";
import type { Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
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

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * 管理者のadmin_usersの行を用意する。注文のキャンセル等、誰が操作したかを残す操作は
 * この行が無い運営者には許されない。本番ではClerkの組織メンバーシップのWebhookが作るが、
 * E2EにはWebhookが届かないため直接作る。ensureAdminUserの後に呼ぶ
 */
export async function ensureAdminUserRow(email: string): Promise<void> {
  const clerkUserId = await getClerkUserIdByEmail(email);
  if (!clerkUserId) {
    throw new Error(`管理者のClerkユーザーが見つかりません: ${email}`);
  }
  const { error } = await supabaseAdmin()
    .from("admin_users")
    .upsert(
      { clerk_user_id: clerkUserId, name: "テスト運営者", email },
      { onConflict: "clerk_user_id" }
    );
  if (error) {
    throw new Error(`管理者の行の作成に失敗しました: ${error.message}`);
  }
}

/**
 * 管理者のadmin_usersの行を削除する。order_status_changesが運営者を参照するため、
 * その運営者が操作した注文を消した後に呼ぶ（注文の削除で状態変更の記録も消える）
 */
export async function deleteAdminUserRow(email: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("admin_users")
    .delete()
    .eq("email", email);
  if (error) {
    throw new Error(`管理者の行の削除に失敗しました: ${error.message}`);
  }
}
