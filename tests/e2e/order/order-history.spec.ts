import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { test, expect } from "../helpers/test-member";

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
    const { error: orderError } = await supabase.from("orders").insert({
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
    });
    expect(itemError).toBeNull();

    await page.goto("/shop");
    await page.getByRole("link", { name: "注文履歴" }).click();
    await expect(page).toHaveURL(/\/orders$/);
    await expect(page.getByRole("heading", { name: "注文履歴" })).toBeVisible();

    const row = page.getByRole("row", {
      name: new RegExp(orderId.slice(0, 8).toUpperCase()),
    });
    await expect(row).toContainText("お支払い済み");
    await expect(row).toContainText("¥24,000");
    await expect(row).toContainText("2点");
  });
});
