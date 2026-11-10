import { createClient } from "next-sanity";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { test, expect, withWorkerSuffix } from "../helpers/test-member";
import { clickAddToCart } from "../helpers/cart";

// 要相談商品は Ver1 では扱わない（docs/domain/catalog.md・#608）。Sanity Studio では
// ONにできないが、古いデータとして残っていた場合に注文できないことを確かめる。
// 既存シードデータには要相談商品（is_negotiable: true）が1件も存在しないため、
// テスト専用のブランド・商品を固定の明示的なIDで作成する。
// delete(id)は指定したIDの行のみを削除する操作のため、既存データに影響しない
// （tests/integration/sanity-products.test.tsで確立したパターンを踏襲）
const TEST_BRAND_ID = withWorkerSuffix("test-invoice-brand-003");
// ブランド名はURLパスのslugとしてもそのまま使われ、/shop/[brand]は名前で商品を
// 引き当てる（IDでは絞り込まない）ため、IDだけでなく名前自体も一意化しないと
// 他のCI実行が作った同名ブランドの商品と混ざって表示されてしまう
const TEST_BRAND_NAME = withWorkerSuffix("TestInvoiceBrand");
const TEST_PRODUCT_ID = withWorkerSuffix("test-invoice-product-003");
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

test.describe("要相談商品は注文できない", () => {
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

  test("要相談商品をカートに入れて注文確定すると、エラーが表示され、注文は作られない", async ({
    page,
    member,
  }) => {
    await page.goto("/shop");
    const brandLink = page.getByRole("link", {
      name: new RegExp(TEST_BRAND_NAME),
    });
    await expect(brandLink).toBeVisible();
    await brandLink.click();
    await expect(page).toHaveURL(new RegExp(`/shop/${TEST_BRAND_NAME}$`));

    const productLink = page
      .locator(`a[href^="/shop/${TEST_BRAND_NAME}/"]`)
      .first();
    await expect(productLink).toBeVisible();
    await productLink.click();
    await expect(page).toHaveURL(new RegExp(`/shop/${TEST_BRAND_NAME}/[^/]+$`));

    await clickAddToCart(page);

    const { userId } = member;
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

    await page
      .getByRole("radio", { name: /テスト 次郎/ })
      .first()
      .check();

    await page.getByRole("button", { name: "注文を確定する" }).click();

    await expect(
      page.getByText(
        `「${TEST_PRODUCT_NAME}」は現在ご注文いただけません。カートから削除してから注文してください`
      )
    ).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/order\/checkout$/);

    const { data: orders } = await supabaseAdmin()
      .from("orders")
      .select("id")
      .eq("user_id", userId);
    expect(orders).toEqual([]);
  });
});
