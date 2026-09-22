import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";

// docs/db-schema-redesign.md「移行方針」9番（GitHub issue #226）
// procurement_tasks新設・order_items.procurement_task_id/received_at追加を検証する統合テスト。

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});
// 削除済み・未定義カラムの確認用（型付きだと存在しないカラム指定がtscで弾かれるため）
const untypedClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const USER_ID = "00000000-0000-0000-0000-000000022601";
const CLERK_USER_ID = "clerk_test_procurement_tasks_schema";
const ADMIN_USER_ID = "00000000-0000-0000-0000-0000000000d1";
const CLERK_ADMIN_ID = "clerk_test_procurement_admin";

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
  payment_timing: "at_order" as const,
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
    await adminClient.from("orders").delete().in("id", orderIds);
  }
  await adminClient.from("users").delete().eq("id", USER_ID);
  await adminClient
    .from("procurement_tasks")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  await adminClient
    .from("admin_memberships")
    .delete()
    .eq("admin_user_id", ADMIN_USER_ID);
  await adminClient.from("admin_users").delete().eq("id", ADMIN_USER_ID);
}

beforeAll(async () => {
  await cleanup();
  const { error } = await adminClient.from("users").insert({
    id: USER_ID,
    clerk_user_id: CLERK_USER_ID,
    email: "procurement-tasks-schema@example.com",
    first_name: "調達",
    last_name: "テスト",
  });
  if (error) throw error;

  const { error: adminError } = await adminClient.from("admin_users").insert({
    id: ADMIN_USER_ID,
    clerk_user_id: CLERK_ADMIN_ID,
    name: "調達 担当",
    email: "procurement-admin@example.com",
  });
  if (adminError) throw adminError;
});

afterAll(async () => {
  await cleanup();
});

describe("procurement_tasks", () => {
  it("statusを省略するとデフォルト値pendingが設定される", async () => {
    const { data, error } = await adminClient
      .from("procurement_tasks")
      .insert({})
      .select("status, assigned_admin_user_id, ordered_at")
      .single();
    expect(error).toBeNull();
    expect(data?.status).toBe("pending");
    expect(data?.assigned_admin_user_id).toBeNull();
    expect(data?.ordered_at).toBeNull();
  });

  it.each(["pending", "claimed", "ordered", "cancelled"])(
    "status=%sは設定できる",
    async (status) => {
      const { error } = await adminClient
        .from("procurement_tasks")
        .insert({ status });
      expect(error).toBeNull();
    }
  );

  it.each(["received", "not_a_status"])(
    "定義外のstatus=%sはCHECK制約で拒否される",
    async (status) => {
      const { error } = await adminClient
        .from("procurement_tasks")
        .insert({ status });
      expect(error).not.toBeNull();
    }
  );

  it("担当スタッフを紐付けて着手中にできる", async () => {
    const { data, error } = await adminClient
      .from("procurement_tasks")
      .insert({ status: "claimed", assigned_admin_user_id: ADMIN_USER_ID })
      .select("assigned_admin_user_id")
      .single();
    expect(error).toBeNull();
    expect(data?.assigned_admin_user_id).toBe(ADMIN_USER_ID);
  });

  it("存在しない担当スタッフへの紐付けは拒否される", async () => {
    const { error } = await adminClient.from("procurement_tasks").insert({
      status: "claimed",
      assigned_admin_user_id: "00000000-0000-0000-0000-00000000dead",
    });
    expect(error).not.toBeNull();
  });

  it("発注日時・メモを記録できる", async () => {
    const orderedAt = new Date().toISOString();
    const { data, error } = await adminClient
      .from("procurement_tasks")
      .insert({
        status: "ordered",
        ordered_at: orderedAt,
        notes: "電話で確認済み",
      })
      .select("ordered_at, notes")
      .single();
    expect(error).toBeNull();
    expect(data?.ordered_at).not.toBeNull();
    expect(data?.notes).toBe("電話で確認済み");
  });

  it("updated_atはUPDATE時に自動更新される", async () => {
    const { data: created } = await adminClient
      .from("procurement_tasks")
      .insert({})
      .select("id, updated_at")
      .single();

    await new Promise((resolve) => setTimeout(resolve, 10));
    await adminClient
      .from("procurement_tasks")
      .update({ status: "claimed", assigned_admin_user_id: ADMIN_USER_ID })
      .eq("id", created!.id);

    const { data: after } = await adminClient
      .from("procurement_tasks")
      .select("updated_at")
      .eq("id", created!.id)
      .single();

    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(created!.updated_at).getTime()
    );
  });

  it("receivedカラムは存在しない（明細単位のreceived_atに置き換え済み）", async () => {
    const { error } = await untypedClient
      .from("procurement_tasks")
      .select("received_at")
      .limit(1);
    expect(error).not.toBeNull();
  });
});

describe("order_items（procurement_task_id / received_at）", () => {
  it("procurement_task_id/received_atはNULLで始まる", async () => {
    const orderId = await createOrder();
    const { data, error } = await adminClient
      .from("order_items")
      .insert({ ...baseItem, order_id: orderId })
      .select("procurement_task_id, received_at")
      .single();
    expect(error).toBeNull();
    expect(data?.procurement_task_id).toBeNull();
    expect(data?.received_at).toBeNull();
  });

  it("明細を発注タスクへ紐付けられる", async () => {
    const orderId = await createOrder();
    const { data: task } = await adminClient
      .from("procurement_tasks")
      .insert({})
      .select("id")
      .single();
    const { data: item, error } = await adminClient
      .from("order_items")
      .insert({
        ...baseItem,
        order_id: orderId,
        procurement_task_id: task!.id,
      })
      .select("procurement_task_id")
      .single();
    expect(error).toBeNull();
    expect(item?.procurement_task_id).toBe(task!.id);
  });

  it("存在しない発注タスクへの紐付けは拒否される", async () => {
    const orderId = await createOrder();
    const { error } = await adminClient.from("order_items").insert({
      ...baseItem,
      order_id: orderId,
      procurement_task_id: "00000000-0000-0000-0000-00000000dead",
    });
    expect(error).not.toBeNull();
  });

  it("入荷日時を明細単位で記録できる（部分入荷）", async () => {
    const orderId = await createOrder();
    const { data: task } = await adminClient
      .from("procurement_tasks")
      .insert({ status: "ordered", ordered_at: new Date().toISOString() })
      .select("id")
      .single();
    const { data: item1 } = await adminClient
      .from("order_items")
      .insert({ ...baseItem, order_id: orderId, procurement_task_id: task!.id })
      .select("id")
      .single();
    const { data: item2 } = await adminClient
      .from("order_items")
      .insert({ ...baseItem, order_id: orderId, procurement_task_id: task!.id })
      .select("id")
      .single();

    const receivedAt = new Date().toISOString();
    const { error } = await adminClient
      .from("order_items")
      .update({ received_at: receivedAt })
      .eq("id", item1!.id);
    expect(error).toBeNull();

    const { data: rows } = await adminClient
      .from("order_items")
      .select("id, received_at")
      .in("id", [item1!.id, item2!.id]);
    const byId = Object.fromEntries(
      (rows ?? []).map((r) => [r.id, r.received_at])
    );
    expect(byId[item1!.id]).not.toBeNull();
    expect(byId[item2!.id]).toBeNull();
  });
});
