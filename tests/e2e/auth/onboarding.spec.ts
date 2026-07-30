import { test, expect, type Browser, type Page } from "@playwright/test";
import {
  signUpViaInvitation,
  cleanupTestUser,
} from "../helpers/clerk-test-invitation";

const TEST_EMAIL = "info+clerk_test_onboarding@wknd-studio.com";
const TEST_PASSWORD = "TestPassw0rd!12345";

// ── 未認証アクセス ─────────────────────────────────────────────

test.describe("未認証アクセス", () => {
  test("未認証で /onboarding/plan にアクセスすると /sign-in へリダイレクトされる", async ({
    page,
  }) => {
    await page.goto("/onboarding/plan");
    await expect(page).toHaveURL(/\/sign-in/);
  });
});

// ── 認証済みアクセス ───────────────────────────────────────────

/**
 * 招待経由で毎回一意な新規アカウントを作成する（以前は環境変数
 * E2E_USER_EMAIL で指定した固定の共有アカウントを使い回しており、
 * 他のテストファイル・並列実行中の他ワーカーと同じアカウントを
 * 同時に操作してしまい、互いのafterEachが相手のSupabase行を
 * 削除し合う競合が発生していた）。
 *
 * 新規作成直後のアカウントは onboarding_completed: false がデフォルト
 * 状態であり、このdescribe内のどのテストもその状態を変更しない
 * （STARTERプラン選択→Stripe Checkout画面への遷移確認で止めており、
 * 実際の決済は行わないため）ため、beforeAllで一度だけ作成して
 * 3つのテストで使い回せる。
 *
 * 3つのテストとも認証済み状態を前提とするため、Playwrightが各テストごとに
 * 用意する新規コンテキストの`page`フィクスチャは使わず、beforeAllで作成した
 * ログイン済みのpage/contextをそのまま使い回す（loginテストとは異なり、
 * ここでは「認証済みであること」自体が前提条件のため）。
 */
test.describe.serial("認証済みアクセス", () => {
  let browserContext: Awaited<ReturnType<Browser["newContext"]>>;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    browserContext = await browser.newContext();
    page = await browserContext.newPage();
    await signUpViaInvitation(page, TEST_EMAIL, TEST_PASSWORD);
  });

  test.afterAll(async () => {
    await browserContext.close();
    await cleanupTestUser(TEST_EMAIL);
  });

  test("onboarding_completed=false のユーザーは /onboarding/plan へリダイレクトされる", async () => {
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/onboarding\/plan/);
  });

  test("プラン選択 UI が表示される", async () => {
    await page.goto("/onboarding/plan");
    await expect(
      page.getByRole("heading", { name: /プランを選択/ })
    ).toBeVisible();
    await expect(page.getByRole("radio", { name: /STARTER/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /BASIC/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /STANDARD/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /PRO/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /ADVANCED/ })).toBeVisible();
    await expect(page.getByRole("radio", { name: /PREMIUM/ })).toBeVisible();
  });

  test("STARTER プランを選択すると Stripe Checkout へリダイレクトされる", async () => {
    await page.goto("/onboarding/plan");
    await page.getByRole("radio", { name: /STARTER/ }).check();
    await page.getByRole("button", { name: /このプランで始める/ }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.com/);
  });
});
