import { clerkClient } from "@clerk/nextjs/server";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  cleanupTestUser,
  getClerkUserIdByEmail,
  slotEmail,
} from "../helpers/clerk-test-invitation";
import { ensureOnboardedMember } from "../helpers/onboarded-member-row";

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const TEST_PASSWORD = "TestPassw0rd!12345";

// GitHub issue #532: 退会時にClerkユーザーを削除せずbanし、再入会で同じClerkユーザー・
// 同じusers行を使えるようにする（#416のA案）。banされたClerkユーザーはサインインできない
test.describe.serial("会員の退会", () => {
  let email: string;
  let clerkUserId: string;

  test.beforeAll(async ({}, workerInfo) => {
    email = slotEmail(
      `info+clerk_test_withdrawal_w${workerInfo.parallelIndex}@wknd-studio.com`
    );
    // 前回の実行で残った（banされた）ユーザー・退会済みの行を消して、毎回作り直す
    await cleanupTestUser(email);
    const created = await (
      await clerkClient()
    ).users.createUser({
      emailAddress: [email],
      // 退会後に同じメールアドレス・パスワードでサインインを試みるため、固定のパスワードにする
      password: TEST_PASSWORD,
      skipLegalChecks: true,
    });
    clerkUserId = created.id;
    await ensureOnboardedMember(supabaseAdmin(), clerkUserId, email);
  });

  test.afterAll(async () => {
    await cleanupTestUser(email);
  });

  test("退会するとその場でログアウトされ、同じメールアドレス・パスワードでサインインできない", async ({
    page,
  }) => {
    // clerk.signInはClerkを読み込む非保護ページで呼ぶ必要がある
    await page.goto("/");
    await clerk.signIn({ page, emailAddress: email });

    await page.goto("/settings");
    await page.getByRole("button", { name: "退会する" }).click();
    await expect(
      page.getByRole("heading", { name: "退会の確認" })
    ).toBeVisible();
    // 確認ダイアログ内の「退会する」で確定する
    await page.getByRole("button", { name: "退会する" }).last().click();

    await expect(page).toHaveURL(/\/withdrawn$/, { timeout: 15_000 });
    await expect(
      page.getByRole("heading", { name: "退会が完了しました" })
    ).toBeVisible();
    // banでClerkのセッションはその場で失効している
    const { data: activeSessions } = await (
      await clerkClient()
    ).sessions.getSessionList({ userId: clerkUserId, status: "active" });
    expect(activeSessions).toEqual([]);

    await page.getByRole("button", { name: "トップへ戻る" }).click();
    await expect(page).toHaveURL(/\/$/);
    // ログアウトしたので、保護されたページを開くとサインインへ戻される
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/sign-in/);

    await setupClerkTestingToken({ page });
    await page.goto("/sign-in");
    await page.locator("#identifier-field").fill(email);
    await page.locator('[data-localization-key="formButtonPrimary"]').click();
    await page.locator("#password-field").fill(TEST_PASSWORD);
    const passwordAttempt = page.waitForResponse((res) =>
      res.url().includes("/attempt_first_factor")
    );
    await page.locator('[data-localization-key="formButtonPrimary"]').click();
    // banされたユーザーは、パスワードが正しくてもClerkが403（user_banned）で弾く
    const response = await passwordAttempt;
    expect(response.status()).toBe(403);
    expect((await response.json()).errors[0].code).toBe("user_banned");
    await expect(page).not.toHaveURL(/\/sign-in\/(factor-two|client-trust)/);
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test("退会後もClerkユーザーは削除されずbanされ、users.clerk_user_idは退会前のまま", async () => {
    expect(await getClerkUserIdByEmail(email)).toBe(clerkUserId);
    const clerkUser = await (await clerkClient()).users.getUser(clerkUserId);
    expect(clerkUser.banned).toBe(true);

    const { data: rows, error } = await supabaseAdmin()
      .from("users")
      .select("clerk_user_id, deleted_at")
      .eq("email", email);
    expect(error).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows![0].clerk_user_id).toBe(clerkUserId);
    expect(rows![0].deleted_at).not.toBeNull();
  });
});
