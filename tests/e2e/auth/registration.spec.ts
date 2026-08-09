import { test, expect } from "@playwright/test";
import {
  signUpAsIndividual,
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
    await signUpAsIndividual(page, TEST_EMAIL, TEST_PASSWORD);

    await page.getByRole("radio", { name: /STARTER/ }).check();
    await page.getByRole("button", { name: /このプランで始める/ }).click();

    await expect(page).toHaveURL(/checkout\.stripe\.com/);
  });
});
