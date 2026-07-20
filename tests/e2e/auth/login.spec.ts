import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getClerkUserId(email: string): Promise<string> {
  const res = await fetch(
    `https://api.clerk.com/v1/users?email_address=${encodeURIComponent(email)}`,
    { headers: { Authorization: `Bearer ${process.env.CLERK_SECRET_KEY}` } }
  );
  const users = await res.json();
  return users[0].id;
}

test.describe("実際のログイン画面を経由したログイン（未知デバイスの確認コード込み）", () => {
  test.skip(
    !process.env.E2E_USER_EMAIL || !process.env.E2E_USER_PASSWORD,
    "E2E_USER_EMAIL / E2E_USER_PASSWORD が未設定のためスキップ"
  );

  let clerkUserId: string;

  test.beforeAll(async () => {
    clerkUserId = await getClerkUserId(process.env.E2E_USER_EMAIL!);
  });

  test.afterEach(async () => {
    await supabaseAdmin()
      .from("users")
      .delete()
      .eq("clerk_user_id", clerkUserId);
  });

  test("メールアドレス・パスワード入力後、確認コードを入力するとログインが完了する", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });

    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(process.env.E2E_USER_EMAIL!);
    await page.getByRole("button", { name: "Continue" }).click();

    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env.E2E_USER_PASSWORD!);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/\/sign-in\/factor-two/);
    await expect(
      page.getByRole("heading", { name: "Check your email" })
    ).toBeVisible();

    // コード入力欄への入力完了と同時に自動送信されるため、Continueボタンのクリックは不要
    await page.getByLabel("Enter verification code").fill("424242");

    await expect(page).toHaveURL(/\/onboarding\/plan|\/shop/);
  });

  test("誤った確認コードを入力した場合、エラーが表示されログインが完了しない", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });

    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(process.env.E2E_USER_EMAIL!);
    await page.getByRole("button", { name: "Continue" }).click();

    await page
      .getByLabel("Password", { exact: true })
      .fill(process.env.E2E_USER_PASSWORD!);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page).toHaveURL(/\/sign-in\/factor-two/);
    await page.getByLabel("Enter verification code").fill("000000");

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page).toHaveURL(/\/sign-in\/factor-two/);
  });
});
