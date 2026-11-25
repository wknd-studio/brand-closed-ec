import { createClient } from "next-sanity";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { test, expect, withWorkerSuffix } from "../helpers/test-member";
import { clickAddToCart } from "../helpers/cart";
import {
  deleteAdminUserRow,
  ensureAdminUserRow,
  signInAsAdmin,
} from "../helpers/admin-user";
import { cleanupTestUser, slotEmail } from "../helpers/clerk-test-invitation";

// 注文はStripeの画面を操作せずに確定できるよう、後払い（after_order）の商品だけで作る。
// 後払いだけの注文は確定後にStripe Checkoutへ遷移せず、/order/invoice-completeへ進む。
// 既存シードデータの支払いタイミングに依存しないよう、テスト専用のブランド・商品を
// 固定の明示的なIDで作成する（tests/e2e/order/mixed-payment-timing-checkout.spec.tsと同じ）
const TEST_BRAND_ID = withWorkerSuffix("test-admin-orders-brand-005");
// /shop/[brand]は名前で商品を引き当てるため、名前も一意化する
const TEST_BRAND_NAME = withWorkerSuffix("TestAdminOrdersBrand");
const TEST_PRODUCT_ID = withWorkerSuffix("test-admin-orders-product-005");
const TEST_PRODUCT_NAME = "テスト運営者注文商品";

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

// 管理者ユーザーはテストの後片付けで削除する。並列に走るワーカー同士で
// 作成・削除が衝突しないよう、ワーカーごと(parallelIndex)に分ける
function adminEmailFor(parallelIndex: number) {
  return slotEmail(
    `info+clerk_test_admin_orders_p${parallelIndex}@wknd-studio.com`
  );
}

test.describe("運営者の注文の確認とキャンセル", () => {
  let adminEmail: string;

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
      retail_price: 50_000,
      is_negotiable: false,
      payment_timing: "after_order",
      prices: { starter: 40_000 },
      min_rank: "starter",
      availability: "available",
    });
  });

  test.afterAll(async ({}, workerInfo) => {
    const client = sanityWriteClient();
    await client.delete(TEST_PRODUCT_ID);
    await client.delete(TEST_BRAND_ID);

    // 会員・注文・住所は test-member の fixture が各テストの終わりに片付ける。
    // キャンセルの記録（order_status_changes）が運営者の行を参照するため、
    // 注文が消えた後のここで運営者を消す（afterEachは fixture の片付けより前に動く）
    const email = adminEmailFor(workerInfo.parallelIndex);
    await deleteAdminUserRow(email);
    await cleanupTestUser(email);
  });

  test.beforeEach(({}, testInfo) => {
    adminEmail = adminEmailFor(testInfo.parallelIndex);
  });

  test("会員が確定した注文を、運営者が一覧で見つけて詳細を確認し、キャンセルすると、詳細の状態がキャンセルになり一覧から外れる", async ({
    browser,
    page,
    member,
  }) => {
    // 会員と運営者の2人分の画面操作を含むため、既定のタイムアウトでは不足しうる
    test.slow();

    // --- 会員: 後払いの商品を注文する ---
    await page.goto(`/shop/${encodeURIComponent(TEST_BRAND_NAME)}`);
    const productLink = page.locator(`a[href^="/shop/${TEST_BRAND_NAME}/"]`, {
      hasText: TEST_PRODUCT_NAME,
    });
    await expect(productLink).toBeVisible();
    await productLink.click();
    await expect(page).toHaveURL(new RegExp(`/shop/${TEST_BRAND_NAME}/[^/]+$`));
    await clickAddToCart(page);

    const { userId, email } = member;
    const address = {
      user_id: userId,
      recipient_last_name: "テスト",
      recipient_first_name: "四郎",
      postal_code: "1500001",
      prefecture: "東京都",
      city: "渋谷区",
      address_line1: "神宮前1-1-1",
      phone_number: "09098765432",
      is_default: true,
    };
    await supabaseAdmin()
      .from("addresses")
      .insert([
        { ...address, type: "shipping" },
        { ...address, type: "billing" },
      ]);

    await page.goto("/order/checkout");
    await expect(
      page.getByRole("heading", { name: "ご注文内容の確認" })
    ).toBeVisible();
    await page
      .getByRole("radio", { name: /テスト 四郎/ })
      .first()
      .check();
    await page.getByRole("button", { name: "注文を確定する" }).click();
    await expect(page).toHaveURL(/\/order\/invoice-complete\?order_id=/, {
      timeout: 15000,
    });

    const { data: orders } = await supabaseAdmin()
      .from("orders")
      .select("id")
      .eq("user_id", userId);
    expect(orders).toHaveLength(1);
    const orderId = orders![0].id;
    const orderNumber = orderId.slice(0, 8).toUpperCase();

    // --- 運営者: 一覧で注文を見つけ、詳細を確認する ---
    const { adminContext, adminPage } = await signInAsAdmin(
      browser,
      adminEmail,
      test.info().project.use.baseURL
    );
    await ensureAdminUserRow(adminEmail);
    try {
      await adminPage.goto("/admin/orders");
      await expect(
        adminPage.getByRole("heading", { name: "注文管理" })
      ).toBeVisible();
      const row = adminPage.getByRole("row").filter({ hasText: orderNumber });
      await expect(row).toContainText("テスト 太郎");
      await expect(row).toContainText("対応中");

      await row.getByRole("link", { name: "詳細" }).click();
      await expect(adminPage).toHaveURL(
        new RegExp(`/admin/orders/${orderId}$`)
      );
      const main = adminPage.locator("main");
      await expect(
        main.getByRole("heading", { name: `注文 ${orderNumber}` })
      ).toBeVisible();
      await expect(main.getByText("対応中", { exact: true })).toBeVisible();
      await expect(main.getByText("テスト 太郎")).toBeVisible();
      await expect(main.getByText(email)).toBeVisible();
      await expect(main.getByText(TEST_PRODUCT_NAME)).toBeVisible();
      await expect(main.getByText(/× 1 ／ 注文後払い ／ 未請求/)).toBeVisible();
      // 明細の小計と合計の2か所に出る
      await expect(main.getByText("¥40,000")).toHaveCount(2);

      // --- 運営者: キャンセルする ---
      await main.getByRole("button", { name: "注文をキャンセル" }).click();
      await expect(main.getByText("注文をキャンセルしますか？")).toBeVisible();
      await main
        .getByPlaceholder("例：顧客都合によるキャンセル")
        .fill("E2Eテストによるキャンセル");
      await main.getByRole("button", { name: "キャンセルする" }).click();

      // キャンセル後は一覧へ戻る。一覧は対応中・上限超過・入金確認済みの注文だけを出すため、
      // キャンセルした注文は一覧から外れる
      await expect(adminPage).toHaveURL(/\/admin\/orders$/, {
        timeout: 15000,
      });
      await expect(
        adminPage.getByRole("heading", { name: "注文管理" })
      ).toBeVisible();
      await expect(
        adminPage.getByRole("row").filter({ hasText: orderNumber })
      ).toHaveCount(0);

      await adminPage.goto(`/admin/orders/${orderId}`);
      await expect(
        main.getByRole("heading", { name: `注文 ${orderNumber}` })
      ).toBeVisible();
      await expect(main.getByText("キャンセル", { exact: true })).toBeVisible();
      await expect(
        main.getByRole("button", { name: "注文をキャンセル" })
      ).toHaveCount(0);
    } finally {
      await adminContext.close();
    }
  });
});
