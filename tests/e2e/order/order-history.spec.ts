import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { test, expect } from "../helpers/test-member";
import {
  displayOrderNumber,
  randomOrderNumber,
} from "../../helpers/order-number";

function supabaseAdmin() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
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
  phoneNumber: "09012345678",
};

// 注文の作成（Stripe Checkout）は checkout.spec.ts・統合テストで確かめているため、
// ここでは支払い済みの注文をDBに直接用意し、マイページから履歴をたどれることだけを確かめる。
// ページネーション・他の会員の注文を含めないこと等の分岐は統合テスト
// （tests/integration/supabase-member-order-query-service.test.ts）で確かめる
test.describe("注文履歴", () => {
  test("ヘッダーの導線から注文履歴を開くと、自分の注文が表示される", async ({
    page,
    member,
  }) => {
    const supabase = supabaseAdmin();
    const orderId = crypto.randomUUID();
    const orderNumber = randomOrderNumber();
    const { error: orderError } = await supabase.from("orders").insert({
      order_number: orderNumber,
      id: orderId,
      user_id: member.userId,
      status: "paid",
      shipping_address_snapshot: addressSnapshot,
      billing_address_snapshot: addressSnapshot,
      rank_at_order: "starter",
      monthly_limit_at_order: 1_000_000,
    });
    expect(orderError).toBeNull();
    const { error: itemError } = await supabase.from("order_items").insert({
      order_id: orderId,
      sanity_product_id: "e2e-order-history-product",
      product_name_snapshot: "注文履歴のテスト商品",
      unit_price_snapshot: 12_000,
      quantity: 2,
      is_negotiable: false,
      payment_timing: "at_order",
      fulfillment_location_code: "office",
    });
    expect(itemError).toBeNull();

    await page.goto("/shop");
    await page.getByRole("link", { name: "注文履歴" }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByRole("heading", { name: "注文履歴" })).toBeVisible();

    // 注文は1件ずつのカードで、カード全体が注文詳細へのリンク
    const row = page.getByRole("link", {
      name: new RegExp(`注文番号 ${displayOrderNumber(orderNumber)}`),
    });
    await expect(row).toContainText("お支払い済み");
    await expect(row).toContainText("¥24,000");
    await expect(row).toContainText("2点");
  });

  test("注文履歴の注文番号から注文詳細を開くと、決済単位ごとの状態と請求前の明細が表示される", async ({
    page,
    member,
  }) => {
    const supabase = supabaseAdmin();
    const orderId = crypto.randomUUID();
    const settlementId = crypto.randomUUID();
    const orderNumber = randomOrderNumber();
    const { error: orderError } = await supabase.from("orders").insert({
      order_number: orderNumber,
      id: orderId,
      user_id: member.userId,
      status: "processing",
      shipping_address_snapshot: addressSnapshot,
      billing_address_snapshot: addressSnapshot,
      rank_at_order: "starter",
      monthly_limit_at_order: 1_000_000,
    });
    expect(orderError).toBeNull();
    const { error: settlementError } = await supabase
      .from("order_settlements")
      .insert({
        id: settlementId,
        order_id: orderId,
        flow: "checkout",
        status: "paid",
        amount_snapshot: 24_000,
      });
    expect(settlementError).toBeNull();
    const { error: itemError } = await supabase.from("order_items").insert([
      {
        order_id: orderId,
        sanity_product_id: "e2e-order-detail-product",
        product_name_snapshot: "注文時に支払った商品",
        unit_price_snapshot: 12_000,
        quantity: 2,
        is_negotiable: false,
        payment_timing: "at_order",
        fulfillment_location_code: "office",
        settlement_id: settlementId,
      },
      {
        order_id: orderId,
        sanity_product_id: "e2e-order-detail-after-product",
        product_name_snapshot: "これから請求する商品",
        unit_price_snapshot: 5_000,
        quantity: 1,
        is_negotiable: false,
        payment_timing: "after_order",
        fulfillment_location_code: "office",
      },
    ]);
    expect(itemError).toBeNull();

    await page.goto("/orders");
    await page
      .getByRole("link", { name: displayOrderNumber(orderNumber) })
      .click();
    await expect(page).toHaveURL(new RegExp(`/orders/${orderId}$`));
    await expect(page.getByRole("heading", { name: "注文詳細" })).toBeVisible();

    const settlement = page.getByRole("region", { name: "注文時のお支払い" });
    await expect(settlement).toContainText("お支払い済み");
    await expect(settlement).toContainText("¥24,000");
    await expect(settlement).toContainText("注文時に支払った商品");
    const unassigned = page.getByRole("region", { name: "請求前" });
    await expect(unassigned).toContainText("これから請求する商品");
  });
});
