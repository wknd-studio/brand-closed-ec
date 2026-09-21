import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// docs/db-schema-redesign.md「移行方針」8番（GitHub issue #219）
// order_settlements新設・order_items.payment_timing/settlement_id追加・
// ordersの列削除とstatus CHECK変更を検証する統合テスト。

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
// 削除済みカラムの不在確認用（型付きだと存在しないカラム指定がtscで弾かれるため）
const untypedClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const USER_ID = "00000000-0000-0000-0000-000000021901";
const CLERK_USER_ID = "clerk_test_order_settlements_schema";

const baseOrder = {
  user_id: USER_ID,
  shipping_address_snapshot: {},
  billing_address_snapshot: {},
  rank_at_order: "starter" as const,
  monthly_limit_at_order: 0,
};

const baseItem = {
  sanity_product_id: "product-1",
  product_name_snapshot: "テスト商品",
  unit_price_snapshot: 1000,
  quantity: 1,
};

async function createOrder(): Promise<string> {
  const { data, error } = await adminClient
    .from("orders")
    .insert(baseOrder)
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function cleanup() {
  const { data: orders } = await adminClient
    .from("orders")
    .select("id")
    .eq("user_id", USER_ID);
  const orderIds = (orders ?? []).map((o) => o.id);
  if (orderIds.length > 0) {
    await adminClient.from("order_items").delete().in("order_id", orderIds);
    await adminClient
      .from("order_settlements")
      .delete()
      .in("order_id", orderIds);
    await adminClient.from("orders").delete().in("id", orderIds);
  }
  await adminClient.from("users").delete().eq("id", USER_ID);
}

beforeAll(async () => {
  await cleanup();
  const { error } = await adminClient.from("users").insert({
    id: USER_ID,
    clerk_user_id: CLERK_USER_ID,
    email: "order-settlements-schema@example.com",
    first_name: "決済",
    last_name: "テスト",
  });
  if (error) throw error;
});

afterAll(async () => {
  await cleanup();
});

describe("orders（決済フロー分離後のスキーマ）", () => {
  it("statusを省略するとデフォルト値processingが設定される", async () => {
    const { data, error } = await adminClient
      .from("orders")
      .insert(baseOrder)
      .select("status")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("processing");
  });

  it.each(["cancelled", "processing", "limit_exceeded", "paid"])(
    "status=%sは設定できる",
    async (status) => {
      const { error } = await adminClient
        .from("orders")
        .insert({ ...baseOrder, status });
      expect(error).toBeNull();
    }
  );

  it.each(["pending_payment", "invoice_sent", "shipping", "not_a_status"])(
    "旧status=%sはCHECK制約で拒否される",
    async (status) => {
      const { error } = await adminClient
        .from("orders")
        .insert({ ...baseOrder, status });
      expect(error).not.toBeNull();
    }
  );

  it.each([
    "payment_flow",
    "requested_by_user_id",
    "approved_by_user_id",
    "approval_status",
    "approved_at",
    "stripe_checkout_session_id",
    "stripe_invoice_id",
    "split_group_id",
    "procurement_due_at",
  ])("削除済みカラム%sは存在しない", async (column) => {
    const { error } = await untypedClient
      .from("orders")
      .select(column)
      .limit(1);
    expect(error).not.toBeNull();
  });
});

describe("order_settlements", () => {
  it("checkoutの決済単位を作成できる", async () => {
    const orderId = await createOrder();
    const { data, error } = await adminClient
      .from("order_settlements")
      .insert({
        order_id: orderId,
        flow: "checkout",
        status: "pending_payment",
        stripe_checkout_session_id: "cs_test_219",
        amount_snapshot: 1000,
      })
      .select("*")
      .single();
    expect(error).toBeNull();
    expect(data?.paid_at).toBeNull();
    expect(data?.cancelled_at).toBeNull();
    expect(data?.stripe_invoice_id).toBeNull();
  });

  it("invoiceの決済単位を作成できる", async () => {
    const orderId = await createOrder();
    const { error } = await adminClient.from("order_settlements").insert({
      order_id: orderId,
      flow: "invoice",
      status: "invoice_sent",
      stripe_invoice_id: "in_test_219",
      amount_snapshot: 5000,
    });
    expect(error).toBeNull();
  });

  it("1つの注文に複数の決済単位を持てる", async () => {
    const orderId = await createOrder();
    const rows = [
      { flow: "checkout", status: "paid" },
      { flow: "invoice", status: "invoice_sent" },
      { flow: "invoice", status: "limit_exceeded" },
    ].map((r) => ({ ...r, order_id: orderId, amount_snapshot: 100 }));
    const { error } = await adminClient.from("order_settlements").insert(rows);
    expect(error).toBeNull();
  });

  it("checkout/invoice以外のflowは拒否される", async () => {
    const orderId = await createOrder();
    const { error } = await adminClient.from("order_settlements").insert({
      order_id: orderId,
      flow: "not_a_flow",
      status: "pending_payment",
      amount_snapshot: 100,
    });
    expect(error).not.toBeNull();
  });

  it("定義外のstatusは拒否される", async () => {
    const orderId = await createOrder();
    const { error } = await adminClient.from("order_settlements").insert({
      order_id: orderId,
      flow: "checkout",
      status: "confirming",
      amount_snapshot: 100,
    });
    expect(error).not.toBeNull();
  });

  it("amount_snapshotは必須", async () => {
    const orderId = await createOrder();
    const { error } = await untypedClient.from("order_settlements").insert({
      order_id: orderId,
      flow: "checkout",
      status: "pending_payment",
    });
    expect(error).not.toBeNull();
  });

  it("存在しない注文への決済単位は拒否される", async () => {
    const { error } = await adminClient.from("order_settlements").insert({
      order_id: "00000000-0000-0000-0000-00000000dead",
      flow: "checkout",
      status: "pending_payment",
      amount_snapshot: 100,
    });
    expect(error).not.toBeNull();
  });
});

describe("order_items（payment_timing / settlement_id）", () => {
  it("payment_timingを指定して明細を作成でき、settlement_idはNULLで始まる", async () => {
    const orderId = await createOrder();
    const { data, error } = await adminClient
      .from("order_items")
      .insert({ ...baseItem, order_id: orderId, payment_timing: "after_order" })
      .select("payment_timing, settlement_id")
      .single();
    expect(error).toBeNull();
    expect(data?.payment_timing).toBe("after_order");
    expect(data?.settlement_id).toBeNull();
  });

  it("payment_timingは必須", async () => {
    const orderId = await createOrder();
    const { error } = await untypedClient
      .from("order_items")
      .insert({ ...baseItem, order_id: orderId });
    expect(error).not.toBeNull();
  });

  it("at_order/after_order以外のpayment_timingは拒否される", async () => {
    const orderId = await createOrder();
    const { error } = await adminClient.from("order_items").insert({
      ...baseItem,
      order_id: orderId,
      payment_timing: "not_a_timing",
    });
    expect(error).not.toBeNull();
  });

  it("明細を決済単位に紐付けられる", async () => {
    const orderId = await createOrder();
    const { data: settlement } = await adminClient
      .from("order_settlements")
      .insert({
        order_id: orderId,
        flow: "checkout",
        status: "pending_payment",
        amount_snapshot: 1000,
      })
      .select("id")
      .single();
    const { data: item, error } = await adminClient
      .from("order_items")
      .insert({
        ...baseItem,
        order_id: orderId,
        payment_timing: "at_order",
        settlement_id: settlement!.id,
      })
      .select("settlement_id")
      .single();
    expect(error).toBeNull();
    expect(item?.settlement_id).toBe(settlement!.id);
  });

  it("存在しない決済単位への紐付けは拒否される", async () => {
    const orderId = await createOrder();
    const { error } = await adminClient.from("order_items").insert({
      ...baseItem,
      order_id: orderId,
      payment_timing: "at_order",
      settlement_id: "00000000-0000-0000-0000-00000000dead",
    });
    expect(error).not.toBeNull();
  });
});
