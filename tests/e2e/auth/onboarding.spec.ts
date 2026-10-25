import { test, expect, type Browser, type Page } from "@playwright/test";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  signUpViaInvitation,
  cleanupTestUser,
  slotEmail,
  STRIPE_CHECKOUT_REDIRECT_TIMEOUT,
} from "../helpers/clerk-test-invitation";

const TEST_EMAIL = slotEmail("info+clerk_test_onboarding@wknd-studio.com");
const CORPORATE_TEST_EMAIL = slotEmail(
  "info+clerk_test_onboarding_corp@wknd-studio.com"
);
const TEST_PASSWORD = "TestPassw0rd!12345";

function supabaseAdmin() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

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
 * describe内の全テストで使い回せる。
 *
 * どのテストも認証済み状態を前提とするため、Playwrightが各テストごとに
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

  test("onboarding_completed=false のユーザーは /onboarding/account-type へリダイレクトされる", async () => {
    await page.goto("/shop");
    await expect(page).toHaveURL(/\/onboarding\/account-type/);
  });

  test("個人として登録を選ぶと /onboarding/plan?accountType=individual に進む", async () => {
    await page.goto("/onboarding/account-type");
    await page.getByRole("radio", { name: /個人として登録/ }).check();
    await page.getByRole("button", { name: /次へ/ }).click();
    await expect(page).toHaveURL(/\/onboarding\/plan\?accountType=individual/);
  });

  // accountTypeは画面間をクエリパラメータだけで引き継いでおり（member_typeが
  // 確定するのは/onboarding/planの送信時のため、種別選択の時点ではまだ
  // usersの行が無く、DBに保存できない）、クエリが欠けた状態のまま
  // プラン選択画面を表示すると「法人として登録」を選んだ会員でも法人情報の
  // 入力欄が消え、個人として登録されてしまう。種別選択を必ず経由させる
  test("accountType が無い状態で /onboarding/plan にアクセスすると種別選択へ戻される", async () => {
    await page.goto("/onboarding/plan");
    await expect(page).toHaveURL(/\/onboarding\/account-type/);
  });

  test("accountType が不正な値の場合も種別選択へ戻される", async () => {
    await page.goto("/onboarding/plan?accountType=unknown");
    await expect(page).toHaveURL(/\/onboarding\/account-type/);
  });

  test("プラン選択 UI が表示される", async () => {
    await page.goto("/onboarding/plan?accountType=individual");
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

  test("個人は法人情報の入力欄が表示されない", async () => {
    await page.goto("/onboarding/plan?accountType=individual");
    await expect(page.getByLabel("会社名")).toBeHidden();
    await expect(page.getByLabel("適格請求書発行事業者登録番号")).toBeHidden();
  });

  // React 19の<form action>は送信後に非制御入力をリセットするため、
  // サーバーが返した入力値で再表示しないと、失敗のたびに入力が消える
  test("電話番号の形式エラーのあとも、氏名とプランの選択が残っている", async () => {
    await page.goto("/onboarding/plan?accountType=individual");
    await page.getByLabel("姓", { exact: true }).fill("山田");
    await page.getByLabel("名", { exact: true }).fill("太郎");
    await page.getByLabel("電話番号").fill("12345");
    await page.getByRole("radio", { name: /STANDARD/ }).check();
    await page.getByRole("button", { name: /このプランで始める/ }).click();

    await expect(page.getByLabel("電話番号")).toHaveAccessibleDescription(
      "電話番号の形式が正しくありません"
    );
    await expect(page.getByLabel("姓", { exact: true })).toHaveValue("山田");
    await expect(page.getByLabel("名", { exact: true })).toHaveValue("太郎");
    await expect(page.getByLabel("電話番号")).toHaveValue("12345");
    await expect(page.getByRole("radio", { name: /STANDARD/ })).toBeChecked();
  });

  // HTMLのrequiredは空白だけの入力を通すため、サーバー側で拒否する
  test("姓・名が空白だけの場合は項目ごとのエラーが表示される", async () => {
    await page.goto("/onboarding/plan?accountType=individual");
    await page.getByLabel("姓", { exact: true }).fill("　");
    await page.getByLabel("名", { exact: true }).fill(" ");
    await page.getByLabel("電話番号").fill("09012345678");
    await page.getByRole("radio", { name: /STARTER/ }).check();
    await page.getByRole("button", { name: /このプランで始める/ }).click();

    await expect(
      page.getByLabel("姓", { exact: true })
    ).toHaveAccessibleDescription("姓を入力してください");
    await expect(
      page.getByLabel("名", { exact: true })
    ).toHaveAccessibleDescription("名を入力してください");
    await expect(page).toHaveURL(/\/onboarding\/plan/);
  });

  test("STARTER プランを選択すると Stripe Checkout へリダイレクトされる", async () => {
    await page.goto("/onboarding/plan?accountType=individual");
    await page.locator('input[name="lastName"]').fill("山田");
    await page.locator('input[name="firstName"]').fill("太郎");
    await page.locator('input[name="phoneNumber"]').fill("09012345678");
    await page.getByRole("radio", { name: /STARTER/ }).check();
    await page.getByRole("button", { name: /このプランで始める/ }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.com/, {
      timeout: STRIPE_CHECKOUT_REDIRECT_TIMEOUT,
    });
  });
});

// ── 法人として登録 ─────────────────────────────────────────────

/**
 * 法人会員のオンボーディング（GitHub issue #200）。個人と同じ1アカウント
 * （`users`の1行）で表現し、`member_type='corporate'`として会社名・
 * 適格請求書発行事業者登録番号を保持する。
 *
 * 上の「認証済みアクセス」とは別のアカウントを使う。同じアカウントを
 * 使い回すと、プラン選択の送信で`member_type`が個人/法人のどちらかに
 * 上書きされ、両describeが並列に走った際（fullyParallel: true）に
 * 互いの検証対象の状態を壊し合う。
 */
test.describe.serial("法人として登録", () => {
  let browserContext: Awaited<ReturnType<Browser["newContext"]>>;
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    browserContext = await browser.newContext();
    page = await browserContext.newPage();
    await signUpViaInvitation(page, CORPORATE_TEST_EMAIL, TEST_PASSWORD);
  });

  test.afterAll(async () => {
    await browserContext.close();
    await cleanupTestUser(CORPORATE_TEST_EMAIL);
  });

  test("法人として登録を選ぶと法人情報の入力欄が表示される", async () => {
    await page.goto("/onboarding/account-type");
    await page.getByRole("radio", { name: /法人として登録/ }).check();
    await page.getByRole("button", { name: /次へ/ }).click();

    await expect(page).toHaveURL(/\/onboarding\/plan\?accountType=corporate/);
    await expect(page.getByLabel("会社名")).toBeVisible();
    await expect(page.getByLabel("適格請求書発行事業者登録番号")).toBeVisible();
  });

  test("インボイス番号の形式が不正な場合はエラーが表示される", async () => {
    await page.goto("/onboarding/plan?accountType=corporate");
    await page.getByLabel("姓", { exact: true }).fill("鈴木");
    await page.getByLabel("名", { exact: true }).fill("一郎");
    await page.getByLabel("電話番号").fill("09012345678");
    await page.getByLabel("会社名").fill("株式会社テスト");
    await page.getByLabel("適格請求書発行事業者登録番号").fill("T123");
    await page.getByRole("radio", { name: /STARTER/ }).check();
    await page.getByRole("button", { name: /このプランで始める/ }).click();

    await expect(
      page.getByLabel("適格請求書発行事業者登録番号")
    ).toHaveAccessibleDescription(
      "適格請求書発行事業者登録番号の形式が正しくありません"
    );
    await expect(page.getByLabel("会社名")).toHaveValue("株式会社テスト");
    await expect(page.getByLabel("適格請求書発行事業者登録番号")).toHaveValue(
      "T123"
    );
  });

  test("法人情報を入力して STARTER を選ぶと corporate として保存される", async () => {
    await page.goto("/onboarding/plan?accountType=corporate");
    await page.getByLabel("姓", { exact: true }).fill("鈴木");
    await page.getByLabel("名", { exact: true }).fill("一郎");
    await page.getByLabel("電話番号").fill("09012345678");
    await page.getByLabel("会社名").fill("株式会社テスト");
    await page
      .getByLabel("適格請求書発行事業者登録番号")
      .fill("T1234567890123");
    await page.getByRole("radio", { name: /STARTER/ }).check();
    await page.getByRole("button", { name: /このプランで始める/ }).click();

    await expect(page).toHaveURL(/checkout\.stripe\.com/, {
      timeout: STRIPE_CHECKOUT_REDIRECT_TIMEOUT,
    });

    const { data, error } = await supabaseAdmin()
      .from("users")
      .select("member_type, company_name, invoice_registration_number")
      .eq("email", CORPORATE_TEST_EMAIL)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      member_type: "corporate",
      company_name: "株式会社テスト",
      invoice_registration_number: "T1234567890123",
    });
  });
});
