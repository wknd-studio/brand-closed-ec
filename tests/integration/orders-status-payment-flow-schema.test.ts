import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// docs/db-schema-redesign.md「移行方針」4番（GitHub issue #168, 親issue #165）
// orders.status / orders.payment_flowがENUMからTEXT+CHECKへ変更されたことを
// 検証する統合テスト。

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const adminClient = createClient<Database>(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID = "00000000-0000-0000-0000-0000000020a1";
const CLERK_USER_ID = "clerk_test_orders_enum_to_text";
const VALID_ORDER_ID = "00000000-0000-0000-0000-0000000020a2";

const baseOrder = {
  user_id: USER_ID,
  shipping_address_snapshot: {},
  billing_address_snapshot: {},
  rank_at_order: "starter" as const,
  monthly_limit_at_order: 0,
};

async function cleanup() {
  await adminClient.from("orders").delete().eq("user_id", USER_ID);
  await adminClient.from("users").delete().eq("id", USER_ID);
}

beforeAll(async () => {
  await cleanup();
  const { error } = await adminClient.from("users").insert({
    id: USER_ID,
    clerk_user_id: CLERK_USER_ID,
    email: "orders-enum-to-text@example.com",
    first_name: "エニュム",
    last_name: "テスト",
  });
  if (error) throw error;
});

afterAll(async () => {
  await cleanup();
});

describe("orders.status / orders.payment_flow（ENUM→TEXT+CHECK）", () => {
  afterAll(async () => {
    await adminClient.from("orders").delete().eq("user_id", USER_ID);
  });

  it("既存ENUMが持っていた全ての値をstatusにTEXTとして設定できる", async () => {
    const statuses = [
      "pending_approval",
      "pending_payment",
      "confirming",
      "limit_exceeded",
      "invoice_sent",
      "paid",
      "sourcing",
      "ordered",
      "preparing",
      "shipping",
      "delivered",
      "cancelled",
    ];

    for (const status of statuses) {
      const { error } = await adminClient
        .from("orders")
        .insert({
          ...baseOrder,
          payment_flow: "checkout",
          status,
        })
        .select("id")
        .single();
      expect(error, `status=${status}`).toBeNull();
    }
  });

  it("statusを省略するとデフォルト値pending_paymentが設定される", async () => {
    const { data, error } = await adminClient
      .from("orders")
      .insert({ ...baseOrder, payment_flow: "checkout" })
      .select("status")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("pending_payment");
  });

  it("CHECK制約に無い値はstatusとして拒否される", async () => {
    const { error } = await adminClient.from("orders").insert({
      ...baseOrder,
      payment_flow: "checkout",
      status: "not_a_real_status",
    });
    expect(error).not.toBeNull();
  });

  it("checkout/invoice以外のpayment_flowは拒否される", async () => {
    const { error } = await adminClient.from("orders").insert({
      ...baseOrder,
      payment_flow: "not_a_real_flow",
      status: "pending_payment",
    });
    expect(error).not.toBeNull();
  });

  it("checkout/invoiceは正常にpayment_flowとして設定できる", async () => {
    const { error: checkoutError } = await adminClient.from("orders").insert({
      ...baseOrder,
      id: VALID_ORDER_ID,
      payment_flow: "checkout",
      status: "pending_payment",
    });
    expect(checkoutError).toBeNull();

    const { error: invoiceError } = await adminClient.from("orders").insert({
      ...baseOrder,
      payment_flow: "invoice",
      status: "confirming",
    });
    expect(invoiceError).toBeNull();
  });
});
