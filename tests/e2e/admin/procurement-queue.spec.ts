import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { test, expect, withWorkerSuffix } from "../helpers/test-member";
import { signInAsAdmin } from "../helpers/admin-user";
import { cleanupTestUser, slotEmail } from "../helpers/clerk-test-invitation";
import { randomOrderNumber } from "../../helpers/order-number";

// 注文の確定までの画面は orders.spec.ts 等が確かめているため、ここでは注文を DB に直接作り、
// 対応待ちキューの画面だけを確かめる。ブランドは Sanity から引くため、Sanity に無い商品IDなら「—」になる
const TEST_PRODUCT_NAME = withWorkerSuffix("テスト対応待ち商品");

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// 並列に走るワーカー同士で管理者の作成・削除が衝突しないよう、ワーカーごとに分ける
function adminEmailFor(parallelIndex: number) {
  return slotEmail(
    `info+clerk_test_admin_procurement_queue_p${parallelIndex}@wknd-studio.com`
  );
}

const addressSnapshot = {
  recipientLastName: "テスト",
  recipientFirstName: "太郎",
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  addressLine1: "丸の内1-1-1",
  addressLine2: "",
  phoneNumber: "03-1234-5678",
};

test.describe("運営者の対応待ちキュー", () => {
  test.afterAll(async ({}, workerInfo) => {
    await cleanupTestUser(adminEmailFor(workerInfo.parallelIndex));
  });

  test("後払いの明細がある注文は、運営者が管理メニューから開いた対応待ちキューに出る。会員が開くと404になる", async ({
    browser,
    page,
    member,
  }, testInfo) => {
    // 会員と運営者の2人分のログインを含むため、既定のタイムアウトでは不足しうる
    test.slow();

    // 注文・明細は test-member の fixture がテストの終わりに片付ける
    const supabase = supabaseAdmin();
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number: randomOrderNumber(),
        user_id: member.userId,
        status: "processing",
        shipping_address_snapshot: addressSnapshot,
        billing_address_snapshot: addressSnapshot,
        rank_at_order: "standard",
        monthly_limit_at_order: 1_000_000,
      })
      .select("id")
      .single();
    if (orderError) throw orderError;
    const { error: itemError } = await supabase.from("order_items").insert({
      order_id: order.id,
      sanity_product_id: withWorkerSuffix("test-procurement-queue-product"),
      product_name_snapshot: TEST_PRODUCT_NAME,
      unit_price_snapshot: 10_000,
      quantity: 2,
      is_negotiable: false,
      payment_timing: "after_order",
      fulfillment_location_code: "office",
    });
    if (itemError) throw itemError;

    // --- 会員: 管理画面は存在しないものとして扱われる ---
    const response = await page.goto("/admin/procurement/queue");
    expect(response?.status()).toBe(404);

    // --- 運営者: 管理メニューから対応待ちキューを開く ---
    const { adminContext, adminPage } = await signInAsAdmin(
      browser,
      adminEmailFor(testInfo.parallelIndex),
      testInfo.project.use.baseURL
    );
    try {
      await adminPage.goto("/admin");
      // ヘッダーにも同じリンクがあるため、管理メニュー（main）のリンクを押す
      await adminPage
        .locator("main")
        .getByRole("link", { name: /対応待ちキュー/ })
        .click();
      await expect(adminPage).toHaveURL(/\/admin\/procurement\/queue$/);
      await expect(
        adminPage.getByRole("heading", { name: "対応待ちキュー" })
      ).toBeVisible();
      const row = adminPage
        .getByRole("row")
        .filter({ hasText: TEST_PRODUCT_NAME });
      await expect(row).toContainText("—");
      await expect(row).toContainText("2");
      await expect(row).toContainText("後払い");
    } finally {
      await adminContext.close();
    }
  });
});
