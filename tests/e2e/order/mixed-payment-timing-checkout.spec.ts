import { test, expect } from "@playwright/test";
import { createClient } from "next-sanity";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  cleanupTestUser,
  signUpAndCompleteOnboarding,
  slotEmail,
  withSlotSuffix,
} from "../helpers/clerk-test-invitation";

const TEST_EMAIL = slotEmail("info+clerk_test_split_checkout@wknd-studio.com");
const TEST_PASSWORD = "TestPassw0rd!12345";

// 既存シードデータのpayment_timingは投入タイミングに依存するため、支払いタイミングが
// 確実に混在するテスト専用のブランド・商品を固定の明示的なIDで作成する
// （tests/e2e/order/invoice.spec.tsで確立したパターンを踏襲）
const TEST_BRAND_ID = withSlotSuffix("test-split-checkout-brand-004");
const TEST_BRAND_NAME = "TestSplitCheckoutBrand";
const AT_ORDER_PRODUCT_ID = withSlotSuffix("test-split-checkout-at-order-004");
const AT_ORDER_PRODUCT_NAME = "テスト先払い商品";
const AFTER_ORDER_PRODUCT_ID = withSlotSuffix(
  "test-split-checkout-after-order-004"
);
const AFTER_ORDER_PRODUCT_NAME = "テスト後払い商品";

function sanityWriteClient() {
  return createClient({
    projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID!,
    dataset: process.env.NEXT_PUBLIC_SANITY_DATASET!,
    apiVersion: "2026-05-17",
    useCdn: false,
    token: process.env.SANITY_WRITE_TOKEN,
  });
}

function supabaseAdmin() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getTestUserId(): Promise<string> {
  const { data } = await supabaseAdmin()
    .from("users")
    .select("id")
    .eq("email", TEST_EMAIL)
    .single();
  return data!.id;
}

test.describe("支払いタイミングが混在するカートのチェックアウト", () => {
  test.beforeAll(async () => {
    const client = sanityWriteClient();
    await client.createOrReplace({
      _id: TEST_BRAND_ID,
      _type: "brand",
      name: TEST_BRAND_NAME,
    });
    await client.createOrReplace({
      _id: AT_ORDER_PRODUCT_ID,
      _type: "product",
      name: AT_ORDER_PRODUCT_NAME,
      brand: { _type: "reference", _ref: TEST_BRAND_ID },
      retail_price: 100_000,
      is_negotiable: false,
      payment_timing: "at_order",
      prices: { starter: 80_000 },
      min_rank: "starter",
      availability: "available",
    });
    await client.createOrReplace({
      _id: AFTER_ORDER_PRODUCT_ID,
      _type: "product",
      name: AFTER_ORDER_PRODUCT_NAME,
      brand: { _type: "reference", _ref: TEST_BRAND_ID },
      retail_price: 50_000,
      is_negotiable: false,
      payment_timing: "after_order",
      prices: { starter: 40_000 },
      min_rank: "starter",
      availability: "available",
    });
  });

  test.afterAll(async () => {
    const client = sanityWriteClient();
    await client.delete(AT_ORDER_PRODUCT_ID);
    await client.delete(AFTER_ORDER_PRODUCT_ID);
    await client.delete(TEST_BRAND_ID);
  });

  test.afterEach(async ({ page }) => {
    // Stripeの外部ドメインに遷移したままだと後続処理が失敗するため、自アプリのドメインに戻す
    await page.goto("/");
    await cleanupTestUser(TEST_EMAIL);
  });

  test("先払い商品と後払い商品を両方カートに入れて注文確定すると、Stripe Checkoutへ遷移し、1件のOrderに先払い分のCheckout決済単位だけが作成される", async ({
    page,
  }) => {
    await signUpAndCompleteOnboarding(page, TEST_EMAIL, TEST_PASSWORD);

    await page.goto("/shop");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByRole("link", { name: new RegExp(TEST_BRAND_NAME) }).click();
    await page.waitForLoadState("networkidle");

    // 先払い商品をカートに追加
    await page
      .locator(`a[href^="/shop/${TEST_BRAND_NAME}/"]`, {
        hasText: AT_ORDER_PRODUCT_NAME,
      })
      .click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "カートに追加" }).click();

    // 後払い商品をカートに追加
    await page.goto(`/shop/${encodeURIComponent(TEST_BRAND_NAME)}`);
    await page.waitForLoadState("networkidle");
    await page
      .locator(`a[href^="/shop/${TEST_BRAND_NAME}/"]`, {
        hasText: AFTER_ORDER_PRODUCT_NAME,
      })
      .click();
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "カートに追加" }).click();

    const userId = await getTestUserId();
    await supabaseAdmin()
      .from("addresses")
      .insert([
        {
          user_id: userId,
          type: "shipping",
          recipient_last_name: "テスト",
          recipient_first_name: "三郎",
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
          recipient_first_name: "三郎",
          postal_code: "1500001",
          prefecture: "東京都",
          city: "渋谷区",
          address_line1: "神宮前1-1-1",
          phone_number: "09098765432",
          is_default: true,
        },
      ]);

    await page.goto("/order/checkout");
    await expect(page.getByRole("heading", { name: "注文確認" })).toBeVisible();

    // 注文確認画面が支払いタイミングごとにグループ表示されることを確認
    // （カートサイドバーは非表示でもDOM上に同じ見出しが存在するため、mainに限定する）
    const main = page.locator("main");
    await expect(main.getByText("注文時に支払う商品")).toBeVisible();
    await expect(main.getByText("注文後に請求される商品")).toBeVisible();

    await page
      .getByRole("radio", { name: /テスト 三郎/ })
      .first()
      .check();

    await page.getByRole("button", { name: "注文を確定する" }).click();

    // at_order商品の決済単位に対してのみStripe Checkoutセッションが作られ、
    // そちらへリダイレクトされる
    await expect(page).toHaveURL(/checkout\.stripe\.com/, { timeout: 15000 });

    // 注文は分割せず1件。at_order明細だけがCheckout決済単位に紐づき、
    // after_order明細は決済単位を持たない（運営者の請求作成を待つ）
    const { data: orders } = await supabaseAdmin()
      .from("orders")
      .select(
        "status, order_settlements(id, flow, status, amount_snapshot), order_items(product_name_snapshot, payment_timing, settlement_id)"
      )
      .eq("user_id", userId);

    expect(orders).toHaveLength(1);
    const order = orders![0];
    expect(order.status).toBe("processing");

    expect(order.order_settlements).toHaveLength(1);
    const settlement = order.order_settlements[0];
    expect(settlement.flow).toBe("checkout");
    expect(settlement.status).toBe("pending_payment");
    expect(settlement.amount_snapshot).toBe(80_000);

    expect(order.order_items).toHaveLength(2);
    const atOrderItem = order.order_items.find(
      (i) => i.product_name_snapshot === AT_ORDER_PRODUCT_NAME
    );
    const afterOrderItem = order.order_items.find(
      (i) => i.product_name_snapshot === AFTER_ORDER_PRODUCT_NAME
    );
    expect(atOrderItem?.payment_timing).toBe("at_order");
    expect(atOrderItem?.settlement_id).toBe(settlement.id);
    expect(afterOrderItem?.payment_timing).toBe("after_order");
    expect(afterOrderItem?.settlement_id).toBeNull();
  });
});
