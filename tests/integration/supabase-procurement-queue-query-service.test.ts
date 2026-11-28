import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseProcurementQueueQueryService } from "@/infrastructure/supabase/supabase-procurement-queue-query-service";
import { displayOrderNumber, randomOrderNumber } from "../helpers/order-number";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID = "00000000-0000-0000-0000-000000348a01";
const CLERK_USER = "clerk_test_procurement_queue";

// 注文日時の古い順に 1 → 5
const AT_ORDER_PAID_ORDER_ID = "00000000-0000-0000-0000-000000348a21";
const AFTER_ORDER_ORDER_ID = "00000000-0000-0000-0000-000000348a22";
const AT_ORDER_PENDING_ORDER_ID = "00000000-0000-0000-0000-000000348a23";
const CANCELLED_ORDER_ID = "00000000-0000-0000-0000-000000348a24";
const MIXED_ORDER_ID = "00000000-0000-0000-0000-000000348a25";
const ALL_ORDER_IDS = [
  AT_ORDER_PAID_ORDER_ID,
  AFTER_ORDER_ORDER_ID,
  AT_ORDER_PENDING_ORDER_ID,
  CANCELLED_ORDER_ID,
  MIXED_ORDER_ID,
];

const PAID_SETTLEMENT_ID = "00000000-0000-0000-0000-000000348a31";
const PENDING_SETTLEMENT_ID = "00000000-0000-0000-0000-000000348a32";
const INVOICE_SETTLEMENT_ID = "00000000-0000-0000-0000-000000348a33";
const MIXED_PAID_SETTLEMENT_ID = "00000000-0000-0000-0000-000000348a34";
const CANCELLED_PAID_SETTLEMENT_ID = "00000000-0000-0000-0000-000000348a35";

const PROCUREMENT_TASK_ID = "00000000-0000-0000-0000-000000348a51";

const AT_ORDER_PAID_ITEM_ID = "00000000-0000-0000-0000-000000348a41";
const AFTER_ORDER_ITEM_ID = "00000000-0000-0000-0000-000000348a42";
const AFTER_ORDER_INVOICED_ITEM_ID = "00000000-0000-0000-0000-000000348a43";
const AT_ORDER_PENDING_ITEM_ID = "00000000-0000-0000-0000-000000348a44";
const CANCELLED_ITEM_ID = "00000000-0000-0000-0000-000000348a45";
const IN_TASK_ITEM_ID = "00000000-0000-0000-0000-000000348a46";
const MIXED_AT_ORDER_ITEM_ID = "00000000-0000-0000-0000-000000348a47";
const MIXED_AFTER_ORDER_ITEM_ID = "00000000-0000-0000-0000-000000348a48";
// 支払い済みの at_order の明細でも、発注タスクに入っている・注文がキャンセルされていれば出ない
const AT_ORDER_IN_TASK_ITEM_ID = "00000000-0000-0000-0000-000000348a49";
const AT_ORDER_CANCELLED_ITEM_ID = "00000000-0000-0000-0000-000000348a4a";
const ALL_ITEM_IDS = [
  AT_ORDER_PAID_ITEM_ID,
  AFTER_ORDER_ITEM_ID,
  AFTER_ORDER_INVOICED_ITEM_ID,
  AT_ORDER_PENDING_ITEM_ID,
  CANCELLED_ITEM_ID,
  IN_TASK_ITEM_ID,
  MIXED_AT_ORDER_ITEM_ID,
  MIXED_AFTER_ORDER_ITEM_ID,
  AT_ORDER_IN_TASK_ITEM_ID,
  AT_ORDER_CANCELLED_ITEM_ID,
];

// 商品とブランド（Sanity）の対応。PRODUCT_UNKNOWN は Sanity から消えた商品
const PRODUCT_A = "prod-348-a";
const PRODUCT_B = "prod-348-b";
const PRODUCT_UNKNOWN = "prod-348-unknown";
const BRANDS = new Map([
  [PRODUCT_A, "ブランドB"],
  [PRODUCT_B, "ブランドA"],
]);
const findBrandNames = vi.fn(async (ids: string[]) => {
  return new Map(
    ids.filter((id) => BRANDS.has(id)).map((id) => [id, BRANDS.get(id)!])
  );
});

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

// 注文IDごとに入れた注文番号（保存する形）。DTO は表示の形（4文字ずつハイフン区切り。#755）で持つ
const orderNumbers = new Map<string, string>();

function order(id: string, createdAt: string, status = "processing") {
  const orderNumber = randomOrderNumber();
  orderNumbers.set(id, orderNumber);
  return {
    id,
    user_id: USER_ID,
    order_number: orderNumber,
    status,
    shipping_address_snapshot: addressSnapshot,
    billing_address_snapshot: addressSnapshot,
    rank_at_order: "standard" as const,
    monthly_limit_at_order: 1_000_000,
    created_at: createdAt,
  };
}

function item(
  id: string,
  orderId: string,
  overrides: Partial<Database["public"]["Tables"]["order_items"]["Insert"]>
): Database["public"]["Tables"]["order_items"]["Insert"] {
  return {
    id,
    order_id: orderId,
    sanity_product_id: PRODUCT_A,
    product_name_snapshot: "テスト商品A",
    unit_price_snapshot: 10_000,
    quantity: 1,
    is_negotiable: false,
    payment_timing: "at_order",
    fulfillment_location_code: "office",
    ...overrides,
  };
}

async function insert<T extends keyof Database["public"]["Tables"]>(
  table: T,
  rows: Database["public"]["Tables"][T]["Insert"][]
) {
  const { error } = await supabase.from(table).insert(rows as never);
  if (error) throw error;
}

async function cleanup() {
  await supabase.from("order_items").delete().in("order_id", ALL_ORDER_IDS);
  await supabase
    .from("procurement_tasks")
    .delete()
    .eq("id", PROCUREMENT_TASK_ID);
  await supabase
    .from("order_settlements")
    .delete()
    .in("order_id", ALL_ORDER_IDS);
  await supabase.from("orders").delete().in("id", ALL_ORDER_IDS);
  await supabase.from("users").delete().eq("id", USER_ID);
}

const service = new SupabaseProcurementQueueQueryService(
  supabase,
  findBrandNames
);

// 他のテストが残した明細がキューに混ざっても判定できるよう、このテストの明細だけを見る
async function queueItems(sort: "queued" | "product" = "queued") {
  const items = await service.findQueueItems({ sort });
  return items.filter((i) => ALL_ITEM_IDS.includes(i.orderItemId));
}

beforeAll(async () => {
  await cleanup();
  await insert("users", [
    {
      id: USER_ID,
      clerk_user_id: CLERK_USER,
      email: `${CLERK_USER}@example.com`,
      first_name: "テスト",
      last_name: "太郎",
      rank_code: "standard",
      onboarding_completed: true,
      billing_anchor_day: 10,
    },
  ]);
  await insert("orders", [
    order(AT_ORDER_PAID_ORDER_ID, "2020-01-01T00:00:00.000Z", "paid"),
    order(AFTER_ORDER_ORDER_ID, "2020-01-02T00:00:00.000Z"),
    order(AT_ORDER_PENDING_ORDER_ID, "2020-01-03T00:00:00.000Z"),
    order(CANCELLED_ORDER_ID, "2020-01-04T00:00:00.000Z", "cancelled"),
    order(MIXED_ORDER_ID, "2020-01-05T00:00:00.000Z"),
  ]);
  await insert("order_settlements", [
    {
      id: PAID_SETTLEMENT_ID,
      order_id: AT_ORDER_PAID_ORDER_ID,
      flow: "checkout",
      status: "paid",
      stripe_checkout_session_id: "cs_test_procurement_queue_001",
      amount_snapshot: 10_000,
      paid_at: "2020-01-01T00:10:00.000Z",
    },
    {
      id: PENDING_SETTLEMENT_ID,
      order_id: AT_ORDER_PENDING_ORDER_ID,
      flow: "checkout",
      status: "pending_payment",
      stripe_checkout_session_id: "cs_test_procurement_queue_002",
      amount_snapshot: 10_000,
    },
    {
      id: INVOICE_SETTLEMENT_ID,
      order_id: AFTER_ORDER_ORDER_ID,
      flow: "invoice",
      status: "invoice_sent",
      stripe_invoice_id: "in_test_procurement_queue_001",
      amount_snapshot: 10_000,
    },
    {
      id: MIXED_PAID_SETTLEMENT_ID,
      order_id: MIXED_ORDER_ID,
      flow: "checkout",
      status: "paid",
      stripe_checkout_session_id: "cs_test_procurement_queue_003",
      amount_snapshot: 10_000,
      paid_at: "2020-01-05T00:10:00.000Z",
    },
    {
      id: CANCELLED_PAID_SETTLEMENT_ID,
      order_id: CANCELLED_ORDER_ID,
      flow: "checkout",
      status: "paid",
      stripe_checkout_session_id: "cs_test_procurement_queue_004",
      amount_snapshot: 10_000,
      paid_at: "2020-01-04T00:10:00.000Z",
    },
  ]);
  await insert("procurement_tasks", [{ id: PROCUREMENT_TASK_ID }]);
  await insert("order_items", [
    item(AT_ORDER_PAID_ITEM_ID, AT_ORDER_PAID_ORDER_ID, {
      settlement_id: PAID_SETTLEMENT_ID,
      quantity: 3,
    }),
    item(AFTER_ORDER_ITEM_ID, AFTER_ORDER_ORDER_ID, {
      payment_timing: "after_order",
      sanity_product_id: PRODUCT_B,
      product_name_snapshot: "テスト商品B",
    }),
    item(AFTER_ORDER_INVOICED_ITEM_ID, AFTER_ORDER_ORDER_ID, {
      payment_timing: "after_order",
      settlement_id: INVOICE_SETTLEMENT_ID,
      sanity_product_id: PRODUCT_UNKNOWN,
      product_name_snapshot: "削除された商品",
    }),
    item(AT_ORDER_PENDING_ITEM_ID, AT_ORDER_PENDING_ORDER_ID, {
      settlement_id: PENDING_SETTLEMENT_ID,
    }),
    item(CANCELLED_ITEM_ID, CANCELLED_ORDER_ID, {
      payment_timing: "after_order",
    }),
    item(IN_TASK_ITEM_ID, MIXED_ORDER_ID, {
      payment_timing: "after_order",
      procurement_task_id: PROCUREMENT_TASK_ID,
    }),
    item(AT_ORDER_IN_TASK_ITEM_ID, MIXED_ORDER_ID, {
      settlement_id: MIXED_PAID_SETTLEMENT_ID,
      procurement_task_id: PROCUREMENT_TASK_ID,
    }),
    item(AT_ORDER_CANCELLED_ITEM_ID, CANCELLED_ORDER_ID, {
      settlement_id: CANCELLED_PAID_SETTLEMENT_ID,
    }),
    item(MIXED_AT_ORDER_ITEM_ID, MIXED_ORDER_ID, {
      settlement_id: MIXED_PAID_SETTLEMENT_ID,
    }),
    item(MIXED_AFTER_ORDER_ITEM_ID, MIXED_ORDER_ID, {
      payment_timing: "after_order",
      sanity_product_id: PRODUCT_B,
      product_name_snapshot: "テスト商品B",
    }),
  ]);
});

afterAll(cleanup);

describe("SupabaseProcurementQueueQueryService.findQueueItems", () => {
  describe("入場条件", () => {
    it("at_order の明細は、決済単位が paid のときだけ出る", async () => {
      const ids = (await queueItems()).map((i) => i.orderItemId);

      expect(ids).toContain(AT_ORDER_PAID_ITEM_ID);
      expect(ids).toContain(MIXED_AT_ORDER_ITEM_ID);
      expect(ids).not.toContain(AT_ORDER_PENDING_ITEM_ID);
    });

    it("after_order の明細は、決済単位が無くても・請求中でも出る", async () => {
      const ids = (await queueItems()).map((i) => i.orderItemId);

      expect(ids).toContain(AFTER_ORDER_ITEM_ID);
      expect(ids).toContain(AFTER_ORDER_INVOICED_ITEM_ID);
      expect(ids).toContain(MIXED_AFTER_ORDER_ITEM_ID);
    });

    it("キャンセルされた注文の明細・発注タスクに入っている明細は出ない", async () => {
      const ids = (await queueItems()).map((i) => i.orderItemId);

      expect(ids).not.toContain(CANCELLED_ITEM_ID);
      expect(ids).not.toContain(IN_TASK_ITEM_ID);
      expect(ids).not.toContain(AT_ORDER_CANCELLED_ITEM_ID);
      expect(ids).not.toContain(AT_ORDER_IN_TASK_ITEM_ID);
    });
  });

  it("対応待ちになった順（注文日時の古い順）に並ぶ", async () => {
    const ids = (await queueItems()).map((i) => i.orderItemId);

    expect(ids).toEqual([
      AT_ORDER_PAID_ITEM_ID,
      AFTER_ORDER_ITEM_ID,
      AFTER_ORDER_INVOICED_ITEM_ID,
      MIXED_AT_ORDER_ITEM_ID,
      MIXED_AFTER_ORDER_ITEM_ID,
    ]);
  });

  it("商品順では、ブランド名・商品名で並べ、ブランドが分からない明細は最後にし、同じ商品の中は対応待ちになった順にする", async () => {
    const ids = (await queueItems("product")).map((i) => i.orderItemId);

    expect(ids).toEqual([
      // ブランドA・テスト商品B
      AFTER_ORDER_ITEM_ID,
      MIXED_AFTER_ORDER_ITEM_ID,
      // ブランドB・テスト商品A
      AT_ORDER_PAID_ITEM_ID,
      MIXED_AT_ORDER_ITEM_ID,
      // ブランド不明
      AFTER_ORDER_INVOICED_ITEM_ID,
    ]);
  });

  it("各行に注文番号・商品名・ブランド・数量・注文日時・支払いタイミングを返す。ブランドが分からなければ null", async () => {
    const items = await queueItems();
    const orderNumber = orderNumbers.get(AT_ORDER_PAID_ORDER_ID)!;

    expect(items[0]).toEqual({
      orderItemId: AT_ORDER_PAID_ITEM_ID,
      orderId: AT_ORDER_PAID_ORDER_ID,
      orderNumber: displayOrderNumber(orderNumber),
      sanityProductId: PRODUCT_A,
      productName: "テスト商品A",
      brandName: "ブランドB",
      quantity: 3,
      orderedAt: "2020-01-01T00:00:00.000Z",
      paymentTiming: "at_order",
    });
    expect(
      items.find((i) => i.orderItemId === AFTER_ORDER_INVOICED_ITEM_ID)
        ?.brandName
    ).toBeNull();
  });
});
