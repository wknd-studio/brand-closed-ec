import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { test, expect, withWorkerSuffix } from "../helpers/test-member";
import { signInAsAdmin } from "../helpers/admin-user";
import { cleanupTestUser, slotEmail } from "../helpers/clerk-test-invitation";
import { randomOrderNumber } from "../../helpers/order-number";

// 発注タスクを作る操作は #351 以降で足すため、ここではタスク・明細を DB に直接作り、
// 一覧から詳細を開くまでの画面だけを確かめる
const TEST_PRODUCT_NAME = withWorkerSuffix("テスト発注タスク商品");

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// 並列に走るワーカー同士で管理者の作成・削除が衝突しないよう、ワーカーごとに分ける
function adminEmailFor(parallelIndex: number) {
  return slotEmail(
    `info+clerk_test_admin_procurement_tasks_p${parallelIndex}@wknd-studio.com`
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

// 明細は test-member の fixture がテストの終わりに消すため、タスクはその後（afterAll）で消す
const createdTaskIds: string[] = [];

test.describe("運営者の発注タスク一覧・詳細", () => {
  test.afterAll(async ({}, workerInfo) => {
    await supabaseAdmin()
      .from("procurement_tasks")
      .delete()
      .in("id", createdTaskIds);
    await cleanupTestUser(adminEmailFor(workerInfo.parallelIndex));
  });

  test("運営者は管理メニューから発注タスク一覧を開き、タスクの詳細で明細と商品ごとの合計を確かめられる。会員が開くと404になる", async ({
    browser,
    page,
    member,
  }, testInfo) => {
    // 会員と運営者の2人分のログインを含むため、既定のタイムアウトでは不足しうる
    test.slow();

    const supabase = supabaseAdmin();
    const { data: task, error: taskError } = await supabase
      .from("procurement_tasks")
      .insert({})
      .select("id")
      .single();
    if (taskError) throw taskError;
    createdTaskIds.push(task.id);
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
    const productId = withWorkerSuffix("test-procurement-task-product");
    const { error: itemError } = await supabase.from("order_items").insert(
      [2, 3].map((quantity) => ({
        order_id: order.id,
        sanity_product_id: productId,
        product_name_snapshot: TEST_PRODUCT_NAME,
        unit_price_snapshot: 10_000,
        quantity,
        is_negotiable: false,
        payment_timing: "after_order",
        procurement_task_id: task.id,
      }))
    );
    if (itemError) throw itemError;

    // --- 会員: 管理画面は存在しないものとして扱われる ---
    const response = await page.goto("/admin/procurement/tasks");
    expect(response?.status()).toBe(404);

    // --- 運営者: 管理メニュー → 発注タスク一覧 → 詳細 ---
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
        .getByRole("link", { name: /^発注タスク/ })
        .click();
      await expect(adminPage).toHaveURL(/\/admin\/procurement\/tasks$/);
      await expect(
        adminPage.getByRole("heading", { name: "発注タスク", exact: true })
      ).toBeVisible();

      await adminPage
        .locator(`a[href="/admin/procurement/tasks/${task.id}"]`)
        .click();
      await expect(adminPage).toHaveURL(
        new RegExp(`/admin/procurement/tasks/${task.id}$`)
      );
      await expect(
        adminPage.getByRole("heading", { name: "発注タスクの詳細" })
      ).toBeVisible();

      const totals = adminPage.getByRole("table", { name: "商品ごとの合計" });
      await expect(
        totals.getByRole("row").filter({ hasText: TEST_PRODUCT_NAME })
      ).toContainText("5");
      const items = adminPage.getByRole("table", { name: "明細" });
      await expect(
        items.getByRole("row").filter({ hasText: TEST_PRODUCT_NAME })
      ).toHaveCount(2);
    } finally {
      await adminContext.close();
    }
  });
});
