import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseProcurementTaskQueryService } from "@/infrastructure/supabase/supabase-procurement-task-query-service";
import type { ProcurementTaskStatusFilter } from "@/queries/procurement-task-query-service";
import { displayOrderNumber, randomOrderNumber } from "../helpers/order-number";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID = "00000000-0000-0000-0000-000000350a01";
const CLERK_USER = "clerk_test_procurement_task_query";
const ADMIN_USER_ID = "00000000-0000-0000-0000-000000350a02";
const CLERK_ADMIN = "clerk_test_procurement_task_query_admin";

// 注文日時の古い順に 1 → 2
const ORDER_1_ID = "00000000-0000-0000-0000-000000350a11";
const ORDER_2_ID = "00000000-0000-0000-0000-000000350a12";
const ALL_ORDER_IDS = [ORDER_1_ID, ORDER_2_ID];

// 作成日時の古い順に pending → claimed → ordered → cancelled
const PENDING_TASK_ID = "00000000-0000-0000-0000-000000350a21";
const CLAIMED_TASK_ID = "00000000-0000-0000-0000-000000350a22";
const ORDERED_TASK_ID = "00000000-0000-0000-0000-000000350a23";
const CANCELLED_TASK_ID = "00000000-0000-0000-0000-000000350a24";
const ALL_TASK_IDS = [
  PENDING_TASK_ID,
  CLAIMED_TASK_ID,
  ORDERED_TASK_ID,
  CANCELLED_TASK_ID,
];

// 着手中のタスクに3明細（商品Aを2つの注文から・商品Bを1つ）
const CLAIMED_A1_ITEM_ID = "00000000-0000-0000-0000-000000350a31";
const CLAIMED_B_ITEM_ID = "00000000-0000-0000-0000-000000350a32";
const CLAIMED_A2_ITEM_ID = "00000000-0000-0000-0000-000000350a33";
const ORDERED_ITEM_ID = "00000000-0000-0000-0000-000000350a34";
const CANCELLED_ITEM_ID = "00000000-0000-0000-0000-000000350a35";

const PRODUCT_A = "prod-350-a";
const PRODUCT_B = "prod-350-b";

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

const orderNumbers = new Map<string, string>();

function order(id: string, createdAt: string) {
  const orderNumber = randomOrderNumber();
  orderNumbers.set(id, orderNumber);
  return {
    id,
    user_id: USER_ID,
    order_number: orderNumber,
    status: "processing",
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
    payment_timing: "after_order",
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
  await supabase.from("procurement_tasks").delete().in("id", ALL_TASK_IDS);
  await supabase.from("orders").delete().in("id", ALL_ORDER_IDS);
  await supabase.from("users").delete().eq("id", USER_ID);
  await supabase.from("admin_users").delete().eq("id", ADMIN_USER_ID);
}

const service = new SupabaseProcurementTaskQueryService(supabase);

// 他のテストが残したタスクが混ざっても判定できるよう、このテストのタスクだけを見る
async function taskIds(status: ProcurementTaskStatusFilter) {
  const tasks = await service.findTasks({ status });
  return tasks.map((t) => t.taskId).filter((id) => ALL_TASK_IDS.includes(id));
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
  await insert("admin_users", [
    {
      id: ADMIN_USER_ID,
      clerk_user_id: CLERK_ADMIN,
      name: "発注 花子",
      email: `${CLERK_ADMIN}@example.com`,
    },
  ]);
  await insert("orders", [
    order(ORDER_1_ID, "2020-01-01T00:00:00.000Z"),
    order(ORDER_2_ID, "2020-01-02T00:00:00.000Z"),
  ]);
  await insert("procurement_tasks", [
    {
      id: PENDING_TASK_ID,
      status: "pending",
      created_at: "2020-02-01T00:00:00.000Z",
    },
    {
      id: CLAIMED_TASK_ID,
      status: "claimed",
      assigned_admin_user_id: ADMIN_USER_ID,
      notes: "メーカーに電話で確認中",
      created_at: "2020-02-02T00:00:00.000Z",
    },
    {
      id: ORDERED_TASK_ID,
      status: "ordered",
      assigned_admin_user_id: ADMIN_USER_ID,
      ordered_at: "2020-02-04T00:00:00.000Z",
      created_at: "2020-02-03T00:00:00.000Z",
    },
    {
      id: CANCELLED_TASK_ID,
      status: "cancelled",
      created_at: "2020-02-05T00:00:00.000Z",
    },
  ]);
  await insert("order_items", [
    item(CLAIMED_A1_ITEM_ID, ORDER_1_ID, {
      procurement_task_id: CLAIMED_TASK_ID,
      quantity: 2,
      received_at: "2020-02-10T00:00:00.000Z",
    }),
    item(CLAIMED_B_ITEM_ID, ORDER_1_ID, {
      procurement_task_id: CLAIMED_TASK_ID,
      sanity_product_id: PRODUCT_B,
      product_name_snapshot: "テスト商品B",
    }),
    item(CLAIMED_A2_ITEM_ID, ORDER_2_ID, {
      procurement_task_id: CLAIMED_TASK_ID,
      quantity: 3,
      fulfillment_location_code: "supplier_direct",
    }),
    item(ORDERED_ITEM_ID, ORDER_2_ID, {
      procurement_task_id: ORDERED_TASK_ID,
    }),
    item(CANCELLED_ITEM_ID, ORDER_2_ID, {
      procurement_task_id: CANCELLED_TASK_ID,
      quantity: 4,
    }),
  ]);
});

afterAll(cleanup);

describe("SupabaseProcurementTaskQueryService.findTasks", () => {
  it("既定（active）では cancelled を除いた全件を、作成日時の新しい順に返す", async () => {
    expect(await taskIds("active")).toEqual([
      ORDERED_TASK_ID,
      CLAIMED_TASK_ID,
      PENDING_TASK_ID,
    ]);
  });

  it.each([
    ["pending", PENDING_TASK_ID],
    ["claimed", CLAIMED_TASK_ID],
    ["ordered", ORDERED_TASK_ID],
    ["cancelled", CANCELLED_TASK_ID],
  ] as const)("ステータス %s で絞り込める", async (status, expected) => {
    expect(await taskIds(status)).toEqual([expected]);
  });

  it("各行にステータス・担当者名・作成日時・発注日時・明細数を返す", async () => {
    const tasks = await service.findTasks({ status: "active" });

    expect(tasks.find((t) => t.taskId === ORDERED_TASK_ID)).toEqual({
      taskId: ORDERED_TASK_ID,
      status: "ordered",
      assigneeName: "発注 花子",
      createdAt: "2020-02-03T00:00:00.000Z",
      orderedAt: "2020-02-04T00:00:00.000Z",
      itemCount: 1,
    });
    expect(tasks.find((t) => t.taskId === CLAIMED_TASK_ID)?.itemCount).toBe(3);
    // 未着手のタスクは担当者・発注日時が無く、明細が無ければ0件
    expect(tasks.find((t) => t.taskId === PENDING_TASK_ID)).toEqual({
      taskId: PENDING_TASK_ID,
      status: "pending",
      assigneeName: null,
      createdAt: "2020-02-01T00:00:00.000Z",
      orderedAt: null,
      itemCount: 0,
    });
  });
});

describe("SupabaseProcurementTaskQueryService.findTaskDetail", () => {
  it("タスクの情報と、明細（商品名・数量・注文・発送拠点・入荷日時）を注文日時の古い順に返す", async () => {
    const detail = await service.findTaskDetail({ taskId: CLAIMED_TASK_ID });

    expect(detail).toMatchObject({
      taskId: CLAIMED_TASK_ID,
      status: "claimed",
      assigneeName: "発注 花子",
      createdAt: "2020-02-02T00:00:00.000Z",
      orderedAt: null,
      notes: "メーカーに電話で確認中",
    });
    expect(detail?.items.map((i) => i.orderItemId).sort()).toEqual(
      [CLAIMED_A1_ITEM_ID, CLAIMED_B_ITEM_ID, CLAIMED_A2_ITEM_ID].sort()
    );
    // 注文1の明細が先、注文2の明細が最後
    expect(detail?.items.at(-1)?.orderItemId).toBe(CLAIMED_A2_ITEM_ID);
    expect(
      detail?.items.find((i) => i.orderItemId === CLAIMED_A1_ITEM_ID)
    ).toEqual({
      orderItemId: CLAIMED_A1_ITEM_ID,
      orderId: ORDER_1_ID,
      orderNumber: displayOrderNumber(orderNumbers.get(ORDER_1_ID)!),
      sanityProductId: PRODUCT_A,
      productName: "テスト商品A",
      quantity: 2,
      fulfillmentLocationName: "事務所",
      receivedAt: "2020-02-10T00:00:00.000Z",
    });
    expect(
      detail?.items.find((i) => i.orderItemId === CLAIMED_A2_ITEM_ID)
    ).toMatchObject({
      fulfillmentLocationName: "仕入れ先直送",
      receivedAt: null,
    });
  });

  it("商品ごとの合計必要数を sanity_product_id ごとの quantity の合計で返す", async () => {
    const detail = await service.findTaskDetail({ taskId: CLAIMED_TASK_ID });

    expect(detail?.productTotals).toEqual([
      {
        sanityProductId: PRODUCT_A,
        productName: "テスト商品A",
        totalQuantity: 5,
      },
      {
        sanityProductId: PRODUCT_B,
        productName: "テスト商品B",
        totalQuantity: 1,
      },
    ]);
  });

  it("取消（cancelled）のタスクも詳細を返す", async () => {
    const detail = await service.findTaskDetail({ taskId: CANCELLED_TASK_ID });

    expect(detail?.status).toBe("cancelled");
    expect(detail?.productTotals).toEqual([
      {
        sanityProductId: PRODUCT_A,
        productName: "テスト商品A",
        totalQuantity: 4,
      },
    ]);
  });

  it("明細の無いタスクは、明細・合計を空で返す", async () => {
    const detail = await service.findTaskDetail({ taskId: PENDING_TASK_ID });

    expect(detail?.items).toEqual([]);
    expect(detail?.productTotals).toEqual([]);
  });

  it("存在しないタスク・UUID の形でないIDは null", async () => {
    expect(
      await service.findTaskDetail({
        taskId: "00000000-0000-0000-0000-000000350aff",
      })
    ).toBeNull();
    expect(await service.findTaskDetail({ taskId: "not-a-uuid" })).toBeNull();
  });
});
