import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// 管理画面の注文キャンセルが、操作した運営者を order_status_changes に記録すること（#237）

const ADMIN_CLERK_USER_ID = "clerk_test_admin_cancel_order";

// ログイン中の運営者。Clerk のセッションの代わりに、userId と role を返す
vi.mock("@/lib/auth/current-user", () => ({
  requireAuth: vi.fn(async () => ({
    userId: ADMIN_CLERK_USER_ID,
    sessionClaims: { metadata: { role: "admin" } },
  })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

import { cancelOrder } from "@/app/admin/orders/[id]/actions";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID = "00000000-0000-0000-0000-0000002375a1";
const ADMIN_USER_ID = "00000000-0000-0000-0000-0000002375f1";
const ORDER_ID = "00000000-0000-0000-0000-000000237501";
const SETTLEMENT_ID = "00000000-0000-0000-0000-000000237511";
const ITEM_ID = "00000000-0000-0000-0000-000000237521";

const snapshot = {
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
  await supabase.from("order_items").delete().eq("order_id", ORDER_ID);
  await supabase.from("order_settlements").delete().eq("order_id", ORDER_ID);
  await supabase.from("orders").delete().eq("id", ORDER_ID);
  await supabase.from("users").delete().eq("id", USER_ID);
  await supabase.from("admin_users").delete().eq("id", ADMIN_USER_ID);
}

beforeAll(async () => {
  await cleanup();
  const inserts = [
    supabase.from("users").insert({
      id: USER_ID,
      clerk_user_id: "clerk_test_admin_cancel_order_member",
      email: "admin-cancel-order-member@example.com",
      first_name: "テスト",
      last_name: "太郎",
      rank_code: "basic",
      onboarding_completed: true,
      billing_anchor_day: 10,
    }),
    supabase.from("admin_users").insert({
      id: ADMIN_USER_ID,
      clerk_user_id: ADMIN_CLERK_USER_ID,
      name: "運営 太郎",
      email: "admin-cancel-order@example.com",
    }),
  ];
  for (const insert of inserts) {
    const { error } = await insert;
    if (error) throw error;
  }
  for (const insert of [
    () =>
      supabase.from("orders").insert({
        id: ORDER_ID,
        user_id: USER_ID,
        status: "processing",
        shipping_address_snapshot: snapshot,
        billing_address_snapshot: snapshot,
        rank_at_order: "basic",
        monthly_limit_at_order: 1_000_000,
      }),
    () =>
      supabase.from("order_settlements").insert({
        id: SETTLEMENT_ID,
        order_id: ORDER_ID,
        flow: "checkout",
        status: "pending_payment",
        amount_snapshot: 10_000,
      }),
    () =>
      supabase.from("order_items").insert({
        id: ITEM_ID,
        order_id: ORDER_ID,
        sanity_product_id: "prod-237",
        product_name_snapshot: "テスト商品",
        unit_price_snapshot: 10_000,
        quantity: 1,
        is_negotiable: false,
        payment_timing: "at_order",
        settlement_id: SETTLEMENT_ID,
      }),
  ]) {
    const { error } = await insert();
    if (error) throw error;
  }
});

afterAll(async () => {
  await cleanup();
});

describe("管理画面の注文キャンセル（cancelOrder Server Action・実DB）", () => {
  it("changed_by='admin' と操作した運営者の admin_users.id を記録する", async () => {
    expect(await cancelOrder(ORDER_ID, "顧客から電話で依頼")).toBeUndefined();

    const { data: order } = await supabase
      .from("orders")
      .select("status")
      .eq("id", ORDER_ID)
      .single();
    expect(order?.status).toBe("cancelled");

    const { data: history } = await supabase
      .from("order_status_changes")
      .select("from_status, to_status, changed_by, changed_by_admin_user_id")
      .eq("order_id", ORDER_ID);
    expect(history).toEqual([
      {
        from_status: "processing",
        to_status: "cancelled",
        changed_by: "admin",
        changed_by_admin_user_id: ADMIN_USER_ID,
      },
    ]);
  });
});
