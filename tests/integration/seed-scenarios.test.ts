import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { SupabaseMemberOrderQueryService } from "@/infrastructure/supabase/supabase-member-order-query-service";
import {
  NO_ORDER_ACCOUNT_EMAIL,
  SCENARIO_ACCOUNT_EMAILS,
  SCENARIO_ID_RANGE,
  seedScenarios,
} from "../../scripts/seed-scenarios";
import {
  SEED_PRODUCTS,
  seedProductRankPrices,
} from "../../scripts/seed-products";

// GitHub issue #713: テスト用アカウントに各状態の注文（シナリオのデータ）を入れるシード。
// 実DBに入れ、2回実行しても行が増えないこと・目印の無い行を消さないこと・
// 入れた注文がアプリから読めて画面に出ることを確認する
const PREFIX = "seed_scenarios_it_";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const logger = { log: () => {}, error: () => {} };
const now = new Date("2026-11-20T03:00:00Z");

// 本物のテスト用アカウントの行（task supabase:seed-users が入れたもの）と区別するため、
// テスト専用のメールアドレスの会員を作って渡す
const accounts = {
  standard: `${PREFIX}standard@example.com`,
  corporate: `${PREFIX}corporate@example.com`,
};
const clerkUserId = (key: keyof typeof accounts) => `clerk_${PREFIX}${key}`;
const userIds: Record<keyof typeof accounts, string> = {
  standard: "",
  corporate: "",
};
let unmarkedOrderId = "";

const ADDRESS = {
  recipientLastName: "手作り",
  recipientFirstName: "注文",
  postalCode: "1500001",
  prefecture: "東京都",
  city: "渋谷区",
  addressLine1: "神宮前1-1-1",
  addressLine2: "",
  phoneNumber: "09012345678",
};

async function deleteScenarioOrders() {
  const { data } = await supabase
    .from("orders")
    .select("id")
    .gte("id", SCENARIO_ID_RANGE.from)
    .lte("id", SCENARIO_ID_RANGE.to);
  const ids = (data ?? []).map((o) => o.id);
  if (ids.length === 0) return;
  await supabase.from("order_items").delete().in("order_id", ids);
  await supabase.from("order_settlements").delete().in("order_id", ids);
  await supabase.from("orders").delete().in("id", ids);
}

async function cleanup() {
  await deleteScenarioOrders();
  const { data: users } = await supabase
    .from("users")
    .select("id")
    .like("clerk_user_id", `clerk_${PREFIX}%`);
  const ids = (users ?? []).map((u) => u.id);
  if (ids.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("id")
      .in("user_id", ids);
    for (const o of orders ?? []) {
      await supabase.rpc("delete_order", { p_order_id: o.id });
    }
    await supabase.from("users").delete().in("id", ids);
  }
}

async function scenarioOrders() {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, user_id, status, created_at, order_items(id, sanity_product_id, product_name_snapshot, unit_price_snapshot, payment_timing), order_settlements(id, flow, status, stripe_checkout_session_id, stripe_invoice_id, paid_at, cancelled_at), order_status_changes(id)"
    )
    .gte("id", SCENARIO_ID_RANGE.from)
    .lte("id", SCENARIO_ID_RANGE.to)
    .order("id");
  if (error) throw error;
  return data;
}

async function rowCounts() {
  const orders = await scenarioOrders();
  return {
    orders: orders.length,
    items: orders.flatMap((o) => o.order_items).length,
    settlements: orders.flatMap((o) => o.order_settlements).length,
    statusChanges: orders.flatMap((o) => o.order_status_changes).length,
  };
}

beforeAll(async () => {
  await cleanup();
  for (const key of ["standard", "corporate"] as const) {
    const { data, error } = await supabase
      .from("users")
      .insert({
        clerk_user_id: clerkUserId(key),
        email: accounts[key],
        first_name: key,
        last_name: "テスト",
        rank_code: "standard",
        member_type: key === "corporate" ? "corporate" : "individual",
        company_name: key === "corporate" ? "株式会社テスト" : null,
        invoice_registration_number:
          key === "corporate" ? "T1234567890123" : null,
        onboarding_completed: true,
      })
      .select("id")
      .single();
    if (error) throw error;
    userIds[key] = data.id;
  }

  // 手で作った注文（目印が無い）。シードを実行しても消えてはいけない
  unmarkedOrderId = crypto.randomUUID();
  const { error } = await supabase.from("orders").insert({
    id: unmarkedOrderId,
    user_id: userIds.standard,
    status: "processing",
    rank_at_order: "standard",
    monthly_limit_at_order: 5000000,
    shipping_address_snapshot: ADDRESS,
    billing_address_snapshot: ADDRESS,
  });
  if (error) throw error;
  const { error: itemError } = await supabase.from("order_items").insert({
    order_id: unmarkedOrderId,
    sanity_product_id: "seed-gucci-001",
    product_name_snapshot: "手で作った注文の明細",
    unit_price_snapshot: 1000,
    quantity: 1,
    payment_timing: "after_order",
  });
  if (itemError) throw itemError;
});

beforeEach(deleteScenarioOrders);
afterAll(cleanup);

describe("seedScenarios（実DB）", () => {
  it("2回実行しても行が増えず、目印の無い注文を消さない", async () => {
    await seedScenarios({ supabase, logger, now, accounts });
    const first = await rowCounts();
    expect(first.orders).toBeGreaterThan(0);

    await seedScenarios({ supabase, logger, now, accounts });
    expect(await rowCounts()).toEqual(first);

    const { data: unmarked } = await supabase
      .from("orders")
      .select("id, order_items(id)")
      .eq("id", unmarkedOrderId)
      .single();
    expect(unmarked?.order_items).toHaveLength(1);
  });

  it("standard の会員に orders.status の各値の注文が21件以上あり、注文履歴のページ送りが確かめられる", async () => {
    await seedScenarios({ supabase, logger, now, accounts });

    const query = new SupabaseMemberOrderQueryService(supabase);
    const page1 = await query.findOrderHistory({
      clerkUserId: clerkUserId("standard"),
      page: 1,
      pageSize: 20,
    });
    // 手で作った注文1件を除いたシナリオの注文が21件以上
    expect(page1.totalCount - 1).toBeGreaterThanOrEqual(21);

    const orders = (await scenarioOrders()).filter(
      (o) => o.user_id === userIds.standard
    );
    expect(new Set(orders.map((o) => o.status))).toEqual(
      new Set(["processing", "paid", "cancelled", "limit_exceeded"])
    );
  });

  it("その場の支払い（at_order）の決済単位が、支払い済み・未払い・キャンセルでそろう", async () => {
    await seedScenarios({ supabase, logger, now, accounts });

    const checkoutStatuses = (await scenarioOrders())
      .flatMap((o) => o.order_settlements)
      .filter((s) => s.flow === "checkout")
      .map((s) => s.status);
    expect(new Set(checkoutStatuses)).toEqual(
      new Set(["paid", "pending_payment", "cancelled"])
    );
  });

  it("法人会員の注文と、状態の変化の履歴がある注文が入る。注文の無い会員の注文は入れない", async () => {
    await seedScenarios({ supabase, logger, now, accounts });

    const orders = await scenarioOrders();
    expect(
      orders.filter((o) => o.user_id === userIds.corporate).length
    ).toBeGreaterThan(0);
    expect(orders.some((o) => o.order_status_changes.length >= 2)).toBe(true);
    expect(Object.values(SCENARIO_ACCOUNT_EMAILS)).not.toContain(
      NO_ORDER_ACCOUNT_EMAIL
    );
  });

  it("どの注文もアプリから読め、保存した状態が決済単位・明細から算出した状態と一致する", async () => {
    await seedScenarios({ supabase, logger, now, accounts });

    const repo = new SupabaseOrderRepository(supabase);
    for (const row of await scenarioOrders()) {
      const order = await repo.findById(row.id);
      expect(order?.status.value, row.id).toBe(row.status);
    }
  });

  it("明細の商品名・単価が、シードの商品の名前とそのランクの価格に合う", async () => {
    await seedScenarios({ supabase, logger, now, accounts });

    const productById = new Map(SEED_PRODUCTS.map((p) => [p._id, p]));
    for (const item of (await scenarioOrders()).flatMap((o) => o.order_items)) {
      const product = productById.get(item.sanity_product_id);
      expect(product, item.sanity_product_id).toBeDefined();
      expect(item.product_name_snapshot).toBe(product!.name);
      expect(item.unit_price_snapshot).toBe(
        seedProductRankPrices(product!).standard
      );
      expect(item.payment_timing).toBe(product!.payment_timing);
    }
  });

  it("Stripe の ID はダミーと分かる値にする", async () => {
    await seedScenarios({ supabase, logger, now, accounts });

    for (const s of (await scenarioOrders()).flatMap(
      (o) => o.order_settlements
    )) {
      for (const id of [s.stripe_checkout_session_id, s.stripe_invoice_id]) {
        if (id !== null) expect(id).toContain("seed_scenario_dummy");
      }
    }
  });

  it("シードの会員が見つからなければ、注文を入れずに失敗する", async () => {
    await expect(
      seedScenarios({
        supabase,
        logger,
        now,
        accounts: { ...accounts, corporate: `${PREFIX}missing@example.com` },
      })
    ).rejects.toThrow("task supabase:seed-users");
    expect((await rowCounts()).orders).toBe(0);
  });
});
