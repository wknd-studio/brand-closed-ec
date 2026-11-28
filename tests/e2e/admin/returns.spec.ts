import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { test, expect, withWorkerSuffix } from "../helpers/test-member";
import {
  deleteAdminUserRow,
  ensureAdminUserRow,
  signInAsAdmin,
} from "../helpers/admin-user";
import { cleanupTestUser, slotEmail } from "../helpers/clerk-test-invitation";
import { randomOrderNumber } from "../../helpers/order-number";

// 会員の申請の画面は request-return の統合テスト等が確かめているため、ここでは申請を DB に直接作り、
// 運営者が管理メニューから一覧・詳細を開いて承認するまでを確かめる（#383）。分岐は統合テストに任せる
const TEST_PRODUCT_NAME = withWorkerSuffix("テスト返品商品");

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// 並列に走るワーカー同士で管理者の作成・削除が衝突しないよう、ワーカーごとに分ける
function adminEmailFor(parallelIndex: number) {
  return slotEmail(
    `info+clerk_test_admin_returns_p${parallelIndex}@wknd-studio.com`
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

test.describe("運営者の返品申請の確認", () => {
  test.afterAll(async ({}, workerInfo) => {
    // 申請は各テストの終わりに消すため、運営者の行を参照する申請は残っていない
    const email = adminEmailFor(workerInfo.parallelIndex);
    await deleteAdminUserRow(email);
    await cleanupTestUser(email);
  });

  test("運営者は管理メニューから返品申請の一覧・詳細を開き、申請を承認できる", async ({
    browser,
    member,
  }, testInfo) => {
    test.slow();

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

    try {
      const { data: item, error: itemError } = await supabase
        .from("order_items")
        .insert({
          order_id: order.id,
          sanity_product_id: withWorkerSuffix("test-return-product"),
          product_name_snapshot: TEST_PRODUCT_NAME,
          unit_price_snapshot: 10_000,
          quantity: 2,
          is_negotiable: false,
          payment_timing: "after_order",
        })
        .select("id")
        .single();
      if (itemError) throw itemError;
      const { data: returnRow, error: returnError } = await supabase
        .from("returns")
        .insert({
          order_id: order.id,
          status: "requested",
          requested_by_user_id: member.userId,
          reason: "不良品: 箱が潰れていた",
        })
        .select("id")
        .single();
      if (returnError) throw returnError;
      const { error: returnItemError } = await supabase
        .from("return_items")
        .insert({
          return_id: returnRow.id,
          order_item_id: item.id,
          quantity: 1,
        });
      if (returnItemError) throw returnItemError;

      const adminEmail = adminEmailFor(testInfo.parallelIndex);
      const { adminContext, adminPage } = await signInAsAdmin(
        browser,
        adminEmail,
        testInfo.project.use.baseURL
      );
      // 承認した運営者を記録するため、admin_users の行が要る
      await ensureAdminUserRow(adminEmail);
      try {
        await adminPage.goto("/admin");
        await adminPage
          .locator("main")
          .getByRole("link", { name: /返品管理/ })
          .click();
        await expect(adminPage).toHaveURL(/\/admin\/returns$/);
        await expect(
          adminPage.getByRole("heading", { name: "返品管理" })
        ).toBeVisible();

        const row = adminPage
          .getByRole("row")
          .filter({ hasText: TEST_PRODUCT_NAME });
        await expect(row).toContainText("申請中");
        await row.getByRole("link", { name: "詳細" }).click();

        await expect(adminPage).toHaveURL(
          new RegExp(`/admin/returns/${returnRow.id}$`)
        );
        await expect(
          adminPage.getByText("不良品: 箱が潰れていた")
        ).toBeVisible();
        await adminPage.getByLabel("運営メモ").fill("着払いで返送を依頼済み");
        await adminPage.getByRole("button", { name: "承認する" }).click();

        await expect(
          adminPage.getByRole("status").filter({ hasText: "承認しました" })
        ).toBeVisible();
        await expect(adminPage.getByText("承認済み").first()).toBeVisible();
        await expect(
          adminPage.getByRole("button", { name: "承認する" })
        ).toHaveCount(0);
      } finally {
        await adminContext.close();
      }
    } finally {
      // 注文は test-member の fixture が片付けるが、申請が注文を参照しているため先に消す
      await supabase.from("returns").delete().eq("order_id", order.id);
    }
  });
});
