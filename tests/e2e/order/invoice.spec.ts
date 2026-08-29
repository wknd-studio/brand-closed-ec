import { test, expect } from "@playwright/test";
import { createClient } from "next-sanity";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import {
  cleanupTestUser,
  signUpAndCompleteOnboarding,
} from "../helpers/clerk-test-invitation";

const TEST_EMAIL = "info+clerk_test_invoice@wknd-studio.com";
const TEST_PASSWORD = "TestPassw0rd!12345";

// 既存シードデータには要相談商品（is_negotiable: true）が1件も存在しないため、
// テスト専用のブランド・商品を固定の明示的なIDで作成する。
// delete(id)は指定したIDの行のみを削除する操作のため、既存データに影響しない
// （tests/integration/sanity-products.test.tsで確立したパターンを踏襲）
const TEST_BRAND_ID = "test-invoice-brand-003";
const TEST_BRAND_NAME = "TestInvoiceBrand";
const TEST_PRODUCT_ID = "test-invoice-product-003";
const TEST_PRODUCT_NAME = "テスト要相談商品";

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

test.describe("要相談商品の見積依頼フロー", () => {
  test.beforeAll(async () => {
    const client = sanityWriteClient();
    await client.createOrReplace({
      _id: TEST_BRAND_ID,
      _type: "brand",
      name: TEST_BRAND_NAME,
    });
    await client.createOrReplace({
      _id: TEST_PRODUCT_ID,
      _type: "product",
      name: TEST_PRODUCT_NAME,
      brand: { _type: "reference", _ref: TEST_BRAND_ID },
      retail_price: 500_000,
      is_negotiable: true,
      prices: null,
      min_rank: "starter",
      availability: "available",
    });
  });

  test.afterAll(async () => {
    const client = sanityWriteClient();
    await client.delete(TEST_PRODUCT_ID);
    await client.delete(TEST_BRAND_ID);
  });

  test.afterEach(async ({ page }) => {
    await page.goto("/");
    await cleanupTestUser(TEST_EMAIL);
  });

  test("要相談商品をカートに追加して注文確定すると、Stripeへ遷移せず確認完了画面へ遷移する", async ({
    page,
  }) => {
    await signUpAndCompleteOnboarding(page, TEST_EMAIL, TEST_PASSWORD);

    await page.goto("/shop");
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByRole("link", { name: new RegExp(TEST_BRAND_NAME) }).click();
    await page.waitForLoadState("networkidle");

    // ブランドの商品一覧ページで価格が「要相談」と表示されることを確認
    await expect(page.getByText("価格要相談").first()).toBeVisible();

    await page.locator(`a[href^="/shop/${TEST_BRAND_NAME}/"]`).first().click();
    await page.waitForLoadState("networkidle");

    // 商品詳細ページでも価格が「要相談」と表示されることを確認
    await expect(page.getByText("価格要相談").first()).toBeVisible();

    await page.getByRole("button", { name: "カートに追加" }).click();

    const userId = await getTestUserId();
    await supabaseAdmin()
      .from("addresses")
      .insert([
        {
          user_id: userId,
          type: "shipping",
          recipient_last_name: "テスト",
          recipient_first_name: "次郎",
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
          recipient_first_name: "次郎",
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
    await expect(
      page.getByText("価格要相談", { exact: true }).first()
    ).toBeVisible();

    await page
      .getByRole("radio", { name: /テスト 次郎/ })
      .first()
      .check();

    await page.getByRole("button", { name: "注文を確定する" }).click();

    // Stripe Checkout画面へは遷移せず、確認完了画面へ遷移する
    await expect(page).toHaveURL(/\/order\/invoice-complete/, {
      timeout: 15000,
    });
    await expect(
      page.getByRole("heading", { name: "ご注文ありがとうございます" })
    ).toBeVisible();

    const { data: order } = await supabaseAdmin()
      .from("orders")
      .select("payment_flow, status")
      .eq("user_id", userId)
      .single();
    expect(order?.payment_flow).toBe("invoice");
    expect(order?.status).toBe("confirming");
  });
});
