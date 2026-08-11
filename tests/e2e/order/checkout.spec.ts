import { test as base, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import {
  cleanupTestUser,
  signUpAndCompleteOnboarding,
} from "../helpers/clerk-test-invitation";

const TEST_EMAIL = "info+clerk_test_checkout@wknd-studio.com";
const TEST_PASSWORD = "TestPassw0rd!12345";

/**
 * このファイルの3テストはいずれも「オンボーディング完了済み会員」であることが
 * 前提条件で、認証フロー自体は検証対象ではない。招待受諾〜プラン選択という
 * 重いUI操作をテストのたびに繰り返すと実行時間が伸びるだけでなく、
 * Clerk側APIの断続的な失敗（helper内のコメント参照）に3倍さらされることになるため、
 * worker単位で一度だけ実施しstorageStateを使い回す。
 * TEST_EMAILはこのファイル専有のため、複数workerで同時実行されても他specと衝突しない。
 */
const test = base.extend<object, { checkoutStorageState: string }>({
  storageState: async ({ checkoutStorageState }, use) => {
    await use(checkoutStorageState);
  },
  checkoutStorageState: [
    async ({ browser }, use) => {
      const context = await browser.newContext();
      const page = await context.newPage();
      await signUpAndCompleteOnboarding(page, TEST_EMAIL, TEST_PASSWORD);
      const storageStatePath = "tests/e2e/.auth/checkout-user.json";
      await context.storageState({ path: storageStatePath });
      await context.close();
      await use(storageStatePath);
    },
    { scope: "worker" },
  ],
});

function supabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function addFirstProductToCart(page: Page): Promise<void> {
  await page.goto("/shop");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.getByRole("link", { name: /GUCCI/ }).first().click();
  await page.waitForLoadState("networkidle");
  await page.locator('a[href^="/shop/GUCCI/"]').first().click();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "カートに追加" }).click();
}

async function fillNewAddress(
  page: Page,
  addressType: "お届け先" | "請求先"
): Promise<void> {
  const buttonIndex = addressType === "お届け先" ? 0 : 1;
  await page
    .getByRole("button", { name: "＋ 新規登録" })
    .nth(buttonIndex)
    .click();
  await page.locator('input[name="recipient_last_name"]').fill("テスト");
  await page.locator('input[name="recipient_first_name"]').fill("太郎");
  await page.locator('input[name="postal_code"]').fill("1000001");
  await page.locator('select[name="prefecture"]').selectOption("東京都");
  await page.locator('input[name="city"]').fill("千代田区");
  await page.locator('input[name="address_line1"]').fill("丸の内1-1-1");
  await page.locator('input[name="phone_number"]').fill("09012345678");
  await page.getByRole("button", { name: "保存" }).click();
  // 固定sleepではなく、保存済み住所が実際に一覧へ反映されたこと（陽性のランドマーク）を
  // 待ってから次の操作に進む。呼び出し元は必ずこの直後に同じラジオを操作する
  await expect(page.getByRole("radio", { name: /テスト 太郎/ })).toBeVisible();
}

async function getTestUserId(): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("users")
    .select("id")
    .eq("email", TEST_EMAIL)
    .single();
  return data!.id;
}

// 3つのテストが同じアカウント（storageStateを使い回す同一会員）を共有するため、
// 並列実行での競合を避けるために直列実行する
test.describe.serial("実際のカタログ〜チェックアウト画面遷移フロー", () => {
  test.afterEach(async ({ page }) => {
    // Stripeの外部ドメインに遷移したままだと後続処理が失敗するため、自アプリのドメインに戻す
    await page.goto("/");
    // アカウント自体は3テストで使い回すため削除しないが、各テストが作成した
    // 住所・注文（派生データ）は次のテストに影響しないようここで必ず片付ける
    const userId = await getTestUserId();
    const { data: orders } = await supabaseAdmin()
      .from("orders")
      .select("id")
      .eq("user_id", userId);
    for (const order of orders ?? []) {
      await supabaseAdmin()
        .from("order_items")
        .delete()
        .eq("order_id", order.id);
    }
    await supabaseAdmin().from("orders").delete().eq("user_id", userId);
    await supabaseAdmin().from("addresses").delete().eq("user_id", userId);
  });

  test.afterAll(async () => {
    await cleanupTestUser(TEST_EMAIL);
  });

  test("登録済み住所がない会員が新規入力した住所で注文を確定すると、Stripe Checkout画面へ遷移する", async ({
    page,
  }) => {
    await addFirstProductToCart(page);

    await page.goto("/order/checkout");
    await expect(page.getByRole("heading", { name: "注文確認" })).toBeVisible();

    await fillNewAddress(page, "お届け先");
    await page.getByRole("radio", { name: /テスト 太郎/ }).check();
    await page.getByRole("checkbox", { name: "お届け先と同じ" }).check();

    await page.getByRole("button", { name: "注文を確定する" }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 15000 });
  });

  test("登録済み住所がある会員が既存住所を選択して注文を確定すると、Stripe Checkout画面へ遷移する", async ({
    page,
  }) => {
    const userId = await getTestUserId();
    await supabaseAdmin()
      .from("addresses")
      .insert([
        {
          user_id: userId,
          type: "shipping",
          recipient_last_name: "テスト",
          recipient_first_name: "花子",
          postal_code: "1500001",
          prefecture: "東京都",
          city: "渋谷区",
          address_line1: "神宮前1-1-1",
          phone_number: "09098765432",
          is_default: true,
        },
        {
          user_id: userId,
          type: "billing",
          recipient_last_name: "テスト",
          recipient_first_name: "花子",
          postal_code: "1500001",
          prefecture: "東京都",
          city: "渋谷区",
          address_line1: "神宮前1-1-1",
          phone_number: "09098765432",
          is_default: true,
        },
      ]);

    await addFirstProductToCart(page);
    await page.goto("/order/checkout");
    await expect(page.getByRole("heading", { name: "注文確認" })).toBeVisible();

    await page
      .getByRole("radio", { name: /テスト 花子/ })
      .first()
      .check();

    await page.getByRole("button", { name: "注文を確定する" }).click();
    await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 15000 });
  });

  test("月次仕入れ上限を超える注文は確定できず、Stripe Checkout画面へ遷移しない", async ({
    page,
  }) => {
    const userId = await getTestUserId();

    // カート追加時点ではまだ確定済み金額がないため、
    // カートへの追加自体（クライアント側の月次上限チェック）はブロックされない。
    // 「注文を確定する」操作時のサーバー側チェック（checkMonthlyLimit）を
    // 検証したいので、上限超過となる確定済み注文はカート追加の後に作成する
    await addFirstProductToCart(page); // GG Marmontコンパクトウォレット ¥58,000

    // STARTERランクの月次上限は300,000円。既に290,000円分を確定済みにしておく
    await supabaseAdmin().from("orders").insert({
      id: "00000000-0000-0000-0000-000000000060",
      user_id: userId,
      payment_flow: "checkout",
      status: "paid",
      rank_at_order: "starter",
      monthly_limit_at_order: 300_000,
      shipping_address_snapshot: {},
      billing_address_snapshot: {},
    });
    await supabaseAdmin().from("order_items").insert({
      order_id: "00000000-0000-0000-0000-000000000060",
      sanity_product_id: "prod-limit-test",
      product_name_snapshot: "上限テスト用商品",
      unit_price_snapshot: 290_000,
      quantity: 1,
      is_negotiable: false,
    });

    await page.goto("/order/checkout");
    await expect(page.getByRole("heading", { name: "注文確認" })).toBeVisible();

    await fillNewAddress(page, "お届け先");
    await page.getByRole("radio", { name: /テスト 太郎/ }).check();
    await page.getByRole("checkbox", { name: "お届け先と同じ" }).check();

    await page.getByRole("button", { name: "注文を確定する" }).click();

    await expect(page.getByText(/上限.*超える/)).toBeVisible();
    await expect(page).toHaveURL(/\/order\/checkout/);
    await expect(page).not.toHaveURL(/checkout\.stripe\.com/);

    const { data: orders } = await supabaseAdmin()
      .from("orders")
      .select("id")
      .eq("user_id", userId)
      .neq("id", "00000000-0000-0000-0000-000000000060");
    expect(orders).toHaveLength(0);
    // このテストが作成した注文（上限テスト用の290,000円分）自体はafterEachで片付く
  });
});
