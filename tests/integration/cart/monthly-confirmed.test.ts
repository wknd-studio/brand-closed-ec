import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { getMonthlyUsageInfo } from "@/lib/cart/monthly-confirmed";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000040";
const TEST_CLERK_ID = "clerk_test_monthly_confirmed_infra";
const TEST_ORDER_CONFIRMED_ID = "00000000-0000-0000-0000-000000000041";
const TEST_ORDER_CANCELLED_ID = "00000000-0000-0000-0000-000000000042";

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

async function cleanup() {
  await supabase
    .from("order_items")
    .delete()
    .in("order_id", [TEST_ORDER_CONFIRMED_ID, TEST_ORDER_CANCELLED_ID]);
  await supabase
    .from("orders")
    .delete()
    .in("id", [TEST_ORDER_CONFIRMED_ID, TEST_ORDER_CANCELLED_ID]);
  await supabase.from("users").delete().eq("id", TEST_USER_ID);
}

beforeAll(async () => {
  await cleanup();

  await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: TEST_CLERK_ID,
    email: "monthly-confirmed-infra-test@example.com",
    first_name: "テスト",
    last_name: "太郎",
    rank: "advanced",
    onboarding_completed: true,
    subscribed_at: new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString(),
  });

  await supabase.from("orders").insert({
    id: TEST_ORDER_CONFIRMED_ID,
    user_id: TEST_USER_ID,
    payment_flow: "checkout",
    status: "paid",
    rank_at_order: "advanced",
    monthly_limit_at_order: 50_000_000,
    shipping_address_snapshot: addressSnapshot,
    billing_address_snapshot: addressSnapshot,
  });
  await supabase.from("order_items").insert({
    order_id: TEST_ORDER_CONFIRMED_ID,
    sanity_product_id: "prod-confirmed",
    product_name_snapshot: "確定済み注文の商品",
    unit_price_snapshot: 1_000_000,
    quantity: 3,
    is_negotiable: false,
  });

  // キャンセル済み注文は月間確定金額の計算に含まれないことを確認するための対照データ
  await supabase.from("orders").insert({
    id: TEST_ORDER_CANCELLED_ID,
    user_id: TEST_USER_ID,
    payment_flow: "checkout",
    status: "cancelled",
    rank_at_order: "advanced",
    monthly_limit_at_order: 50_000_000,
    shipping_address_snapshot: addressSnapshot,
    billing_address_snapshot: addressSnapshot,
  });
  await supabase.from("order_items").insert({
    order_id: TEST_ORDER_CANCELLED_ID,
    sanity_product_id: "prod-cancelled",
    product_name_snapshot: "キャンセル済み注文の商品",
    unit_price_snapshot: 100_000_000,
    quantity: 1,
    is_negotiable: false,
  });
});

afterAll(async () => {
  await cleanup();
});

describe("getMonthlyUsageInfo（実DB・7ランク）", () => {
  it("advancedランクの上限値（50,000,000円）を正しく取得する", async () => {
    const info = await getMonthlyUsageInfo(TEST_CLERK_ID);
    expect(info.monthlyLimit).toBe(50_000_000);
  });

  it("キャンセル済み注文を除いた確定済み金額を正しく計算する", async () => {
    const info = await getMonthlyUsageInfo(TEST_CLERK_ID);
    expect(info.confirmedAmount).toBe(3_000_000);
  });
});
