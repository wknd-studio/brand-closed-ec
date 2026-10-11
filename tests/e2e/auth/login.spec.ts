import { setupClerkTestingToken } from "@clerk/testing/playwright";
import { test, expect } from "@playwright/test";
import {
  signUpViaInvitation,
  cleanupTestUser,
  slotEmail,
} from "../helpers/clerk-test-invitation";

const TEST_EMAIL = slotEmail("info+clerk_test_login@wknd-studio.com");
const TEST_PASSWORD = "TestPassw0rd!12345";

/**
 * 招待経由で毎回一意な新規アカウントを作成する（以前は環境変数
 * E2E_USER_EMAIL で指定した固定の共有アカウントを使い回しており、
 * onboarding.spec.tsと同じアカウントを操作するため互いのafterEachが
 * 相手のSupabase行を削除し合う競合が発生していた）。
 *
 * アカウント作成自体は使い捨ての別ブラウザコンテキストで行う。
 * 各テストの既定の`page`（Playwrightが用意する新規コンテキスト）で
 * ログインし直すことで、Clerkから見て「見覚えのないデバイス」からの
 * サインインとなり、本テストの主題である未知デバイス確認コードの
 * フローが正しく発生する（作成に使ったコンテキストのままログインすると
 * 同一デバイスとみなされ確認コードが要求されない可能性があるため）。
 */
test.describe("実際のログイン画面を経由したログイン（未知デバイスの確認コード込み）", () => {
  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await signUpViaInvitation(page, TEST_EMAIL, TEST_PASSWORD);
    await context.close();
  });

  test.afterAll(async () => {
    await cleanupTestUser(TEST_EMAIL);
  });

  test("メールアドレス・パスワード入力後、確認コードを入力するとログインが完了する", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });

    // 日本語ローカライズ後もラベル文言に依存しないよう、Clerkが付与する
    // 安定した要素属性(id・data-localization-key)でフォーム要素を指定する
    await page.goto("/sign-in");
    await page.locator("#identifier-field").fill(TEST_EMAIL);
    await page.locator('[data-localization-key="formButtonPrimary"]').click();

    await page.locator("#password-field").fill(TEST_PASSWORD);
    // 確認コードの発行（prepare_second_factor）は画面遷移と並行して非同期に行われ、
    // その完了前にコードを入力すると、自動送信されたattempt_second_factorが400で
    // 拒否され画面がfactor-twoのまま止まる。Clerkまでの通信が遅いCI・stgでのみ
    // この競合が起きて断続的に失敗していたため（#281）、発行の完了を待ってから入力する
    const secondFactorPrepared = page.waitForResponse(
      (res) => res.url().includes("/prepare_second_factor") && res.ok()
    );
    await page.locator('[data-localization-key="formButtonPrimary"]').click();

    await expect(page).toHaveURL(/\/sign-in\/factor-two/);
    await secondFactorPrepared;
    await expect(
      page.locator('[data-localization-key="signIn.emailCodeMfa.title"]')
    ).toBeVisible();

    // コード入力欄への入力完了と同時に自動送信されるため、Continueボタンのクリックは不要
    await page.getByLabel("Enter verification code").fill("424242");

    await expect(page).toHaveURL(/\/onboarding\/account-type|\/shop/);
  });
});
