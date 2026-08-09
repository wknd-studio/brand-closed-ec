import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";
import {
  createTestInvitation,
  cleanupTestUser,
} from "../helpers/clerk-test-invitation";

const TEST_EMAIL = "info+clerk_test_registration@wknd-studio.com";
const TEST_PASSWORD = "TestPassw0rd!12345";

test.describe("実際の登録画面を経由した新規会員登録", () => {
  test.afterEach(async ({ page }) => {
    // Stripeの外部ドメインに遷移したままだと後続処理が失敗するため、自アプリのドメインに戻す
    await page.goto("/");
    await cleanupTestUser(TEST_EMAIL);
  });

  test("招待リンクから登録し、STARTERプランを選択するとStripe Checkoutへ到達する", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });

    const invitationUrl = await createTestInvitation(TEST_EMAIL);
    await page.goto(invitationUrl);

    await expect(page.getByRole("heading", { name: "利用規約" })).toBeVisible();
    await page.getByLabel("利用規約に同意する").check();
    await page
      .getByRole("button", { name: "同意してアカウントを作成" })
      .click();

    await expect(page).toHaveURL(/\/sign-up/);
    await page.getByLabel("Password", { exact: true }).fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Continue" }).click();

    // Clerk Dashboard側の「サインアップ後の遷移先」設定が/onboarding/planを
    // 指しているため、招待チケット経由のサインアップ直後は/onboarding/account-type
    // を経由せず直接ここに着地する（clerk-test-invitation.tsのコメント参照）
    await expect(page).toHaveURL(/\/onboarding\/plan/);
    await page.getByRole("radio", { name: /STARTER/ }).check();
    await page.getByRole("button", { name: /このプランで始める/ }).click();

    await expect(page).toHaveURL(/checkout\.stripe\.com/);
  });
});
