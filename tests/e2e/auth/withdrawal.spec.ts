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

  test("退会するとログアウトされ、同じメールアドレス・パスワードでサインインできない", async ({
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

    await expect(page).toHaveURL(/\/$/, { timeout: 15_000 });
    // ログアウトしたので、保護されたページを開くとサインインへ戻される
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/sign-in/);

    await setupClerkTestingToken({ page });
    await page.goto("/sign-in");
    await page.locator("#identifier-field").fill(email);
    await page.locator('[data-localization-key="formButtonPrimary"]').click();
    const passwordField = page.locator("#password-field");
    // banされたユーザーは、メールアドレスの段階で弾かれることもある
    if (await passwordField.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await passwordField.fill(TEST_PASSWORD);
      await page.locator('[data-localization-key="formButtonPrimary"]').click();
    }
    await expect(page.locator(".cl-formFieldErrorText").first()).toBeVisible();
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
