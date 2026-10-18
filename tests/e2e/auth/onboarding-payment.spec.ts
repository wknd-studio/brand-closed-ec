import { test, expect, type Browser, type Page } from "@playwright/test";
import { getStripe, STRIPE_PRICE_IDS } from "@/lib/stripe";
import {
  signUpViaInvitation,
  signUpAsIndividual,
  cleanupTestUser,
  slotEmail,
} from "../helpers/clerk-test-invitation";

const TEST_PASSWORD = "TestPassw0rd!12345";

/**
 * 決済画面は請求するランクをURLの`?plan=`ではなく、selectPlanで保存した
 * 登録内容（users.rank_code・氏名・電話番号）から決める（GitHub issue #406）。
 * 各describeは別アカウントを使う（fullyParallel: trueで並列に走っても、
 * 互いのusers行を書き換え合わないようにするため）
 */
test.describe.serial("プランを選ばずに決済画面を開く", () => {
  const email = slotEmail(
    "info+clerk_test_onboarding_pay_skip@wknd-studio.com"
  );
  let browserContext: Awaited<ReturnType<Browser["newContext"]>>;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    browserContext = await browser.newContext();
    page = await browserContext.newPage();
    await signUpViaInvitation(page, email, TEST_PASSWORD);
  });

  test.afterAll(async () => {
    await browserContext.close();
    await cleanupTestUser(email);
  });

  test("URLでプランを指定しても種別選択へ戻される", async () => {
    await page.goto("/onboarding/payment?plan=starter");
    await expect(page).toHaveURL(/\/onboarding\/account-type/);
  });
});

test.describe.serial("プラン選択後にURLのプランを書き換える", () => {
  const email = slotEmail(
    "info+clerk_test_onboarding_pay_tamper@wknd-studio.com"
  );
  let browserContext: Awaited<ReturnType<Browser["newContext"]>>;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    browserContext = await browser.newContext();
    page = await browserContext.newPage();
    await signUpAsIndividual(page, email, TEST_PASSWORD);
  });

  test.afterAll(async () => {
    await browserContext.close();
    await cleanupTestUser(email);
  });

  test("Checkoutは保存したプラン（PREMIUM）で作られる", async () => {
    await page.getByRole("radio", { name: /PREMIUM/ }).check();
    await page.getByRole("button", { name: /このプランで始める/ }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.com/);
    const firstSessionId = page
      .url()
      .match(/cs_(?:test|live)_[A-Za-z0-9]+/)?.[0];
    expect(firstSessionId).toBeDefined();

    await page.goto("/onboarding/payment?plan=starter");
    await expect(page).toHaveURL(/checkout\.stripe\.com/);

    const sessionId = page.url().match(/cs_(?:test|live)_[A-Za-z0-9]+/)?.[0];
    expect(sessionId).toBeDefined();

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId!);
    expect(session.metadata?.plan).toBe("premium");

    // 決済画面を開き直しても、同じStripe Customerで決済させる（GitHub issue #410）
    const firstSession = await stripe.checkout.sessions.retrieve(
      firstSessionId!
    );
    expect(session.customer).toEqual(expect.stringMatching(/^cus_/));
    expect(session.customer).toBe(firstSession.customer);

    const lineItems = await stripe.checkout.sessions.listLineItems(sessionId!);
    expect(lineItems.data.map((item) => item.price?.id).sort()).toEqual(
      [
        STRIPE_PRICE_IDS.premium.monthly,
        STRIPE_PRICE_IDS.premium.initialFee,
      ].sort()
    );
  });
});
