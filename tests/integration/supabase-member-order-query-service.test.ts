import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";
import { SupabaseMemberOrderQueryService } from "@/infrastructure/supabase/supabase-member-order-query-service";

// ローカル開発用Supabase CLIが固定で発行するJWTシークレット（supabase-server-client.test.ts と同じ）
const LOCAL_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signTestJwt(sub: string): string {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
      sub,
    })
  );
  const signature = createHmac("sha256", LOCAL_JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest();
  return `${header}.${payload}.${base64url(signature)}`;
}

const { getToken } = vi.hoisted(() => ({
  getToken: vi.fn<() => Promise<string | null>>(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireAuth: vi.fn(async () => ({ getToken })),
}));

import { memberOrderQueryService } from "@/composition/member-order-query";
import { randomOrderNumber } from "../helpers/order-number";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID = "00000000-0000-0000-0000-000000450a01";
const OTHER_USER_ID = "00000000-0000-0000-0000-000000450b01";
const WITHDRAWN_USER_ID = "00000000-0000-0000-0000-000000450c01";
const CLERK_USER = "clerk_test_member_order_query";
const CLERK_OTHER_USER = "clerk_test_member_order_query_other";
const CLERK_WITHDRAWN_USER = "clerk_test_member_order_query_withdrawn";
// 注文履歴（findOrderHistory）用の会員。他の describe の注文と混ざらないよう分ける
const HISTORY_USER_ID = "00000000-0000-0000-0000-000000364a01";
const CLERK_HISTORY_USER = "clerk_test_member_order_query_history";
const ALL_USER_IDS = [
  USER_ID,
  OTHER_USER_ID,
  WITHDRAWN_USER_ID,
  HISTORY_USER_ID,
];

const SHIPPING_DEFAULT_ID = "00000000-0000-0000-0000-000000450a11";
const SHIPPING_OTHER_ID = "00000000-0000-0000-0000-000000450a12";
const BILLING_ID = "00000000-0000-0000-0000-000000450a13";
const OTHER_USER_ADDRESS_ID = "00000000-0000-0000-0000-000000450b11";

const MIXED_ORDER_ID = "00000000-0000-0000-0000-000000450a21";
const AT_ORDER_ONLY_ORDER_ID = "00000000-0000-0000-0000-000000450a22";
const WITHDRAWN_USER_ORDER_ID = "00000000-0000-0000-0000-000000450c21";
// 注文履歴の会員の注文。古い順に paid → cancelled → limit_exceeded → processing（要相談の明細を含む）
const HISTORY_PAID_ORDER_ID = "00000000-0000-0000-0000-000000364a21";
const HISTORY_CANCELLED_ORDER_ID = "00000000-0000-0000-0000-000000364a22";
const HISTORY_LIMIT_EXCEEDED_ORDER_ID = "00000000-0000-0000-0000-000000364a23";
const HISTORY_PROCESSING_ORDER_ID = "00000000-0000-0000-0000-000000364a24";
// 注文詳細（findOrderDetail）用の注文。支払い済みの Checkout・請求済みの Invoice・請求前の明細を持つ
const DETAIL_ORDER_ID = "00000000-0000-0000-0000-000000365a21";
// 作成順（ID の順ではなく）に並ぶことを確かめるため、後に作る Invoice の ID を小さくする
const DETAIL_CHECKOUT_SETTLEMENT_ID = "00000000-0000-0000-0000-000000365a32";
const DETAIL_INVOICE_SETTLEMENT_ID = "00000000-0000-0000-0000-000000365a31";
const DETAIL_CHECKOUT_ITEM_ID = "00000000-0000-0000-0000-000000365a41";
const DETAIL_INVOICE_ITEM_ID = "00000000-0000-0000-0000-000000365a42";
const DETAIL_UNASSIGNED_ITEM_ID = "00000000-0000-0000-0000-000000365a43";
const DETAIL_REQUESTED_RETURN_ID = "00000000-0000-0000-0000-000000381a51";
const DETAIL_REJECTED_RETURN_ID = "00000000-0000-0000-0000-000000381a52";
const ALL_ORDER_IDS = [
  MIXED_ORDER_ID,
  AT_ORDER_ONLY_ORDER_ID,
  WITHDRAWN_USER_ORDER_ID,
  HISTORY_PAID_ORDER_ID,
  HISTORY_CANCELLED_ORDER_ID,
  HISTORY_LIMIT_EXCEEDED_ORDER_ID,
  HISTORY_PROCESSING_ORDER_ID,
  DETAIL_ORDER_ID,
];
const MIXED_SETTLEMENT_ID = "00000000-0000-0000-0000-000000450a31";
const AT_ORDER_ONLY_SETTLEMENT_ID = "00000000-0000-0000-0000-000000450a32";
const AT_ORDER_ITEM_ID = "00000000-0000-0000-0000-000000450a41";
const AFTER_ORDER_ITEM_ID = "00000000-0000-0000-0000-000000450a42";
const NEGOTIABLE_AFTER_ORDER_ITEM_ID = "00000000-0000-0000-0000-000000450a43";
const AT_ORDER_ONLY_ITEM_ID = "00000000-0000-0000-0000-000000450a44";
const SESSION_ID = "cs_test_member_order_query_001";
const AT_ORDER_ONLY_SESSION_ID = "cs_test_member_order_query_002";
const WITHDRAWN_USER_SESSION_ID = "cs_test_member_order_query_003";
const WITHDRAWN_USER_SETTLEMENT_ID = "00000000-0000-0000-0000-000000450c31";
const WITHDRAWN_USER_ITEM_ID = "00000000-0000-0000-0000-000000450c41";
const CREATED_AT = "2026-06-12T03:00:00.000Z";

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

function address(
  id: string,
  userId: string,
  type: "shipping" | "billing",
  isDefault: boolean,
  city: string
) {
  return {
    id,
    user_id: userId,
    type,
    is_default: isDefault,
    recipient_last_name: "テスト",
    recipient_first_name: "太郎",
    postal_code: "100-0001",
    prefecture: "東京都",
    city,
    address_line1: "丸の内1-1-1",
    phone_number: "03-1234-5678",
  };
}

function order(
  id: string,
  userId = USER_ID,
  { status = "processing", createdAt = CREATED_AT } = {}
) {
  return {
    id,
    user_id: userId,
    order_number: randomOrderNumber(),
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
) {
  return {
    id,
    order_id: orderId,
    sanity_product_id: "prod-450",
    product_name_snapshot: "テスト商品",
    unit_price_snapshot: 50_000,
    quantity: 2,
    is_negotiable: false,
    payment_timing: "at_order",
    ...overrides,
  };
}

async function cleanup() {
  // return_items は申請の削除と一緒に消える（ON DELETE CASCADE）
  await supabase.from("returns").delete().in("order_id", ALL_ORDER_IDS);
  await supabase.from("order_items").delete().in("order_id", ALL_ORDER_IDS);
  await supabase
    .from("order_settlements")
    .delete()
    .in("order_id", ALL_ORDER_IDS);
  await supabase.from("orders").delete().in("id", ALL_ORDER_IDS);
  await supabase.from("addresses").delete().in("user_id", ALL_USER_IDS);
  await supabase.from("subscriptions").delete().in("user_id", ALL_USER_IDS);
  await supabase.from("users").delete().in("id", ALL_USER_IDS);
}

function subscription(
  userId: string,
  stripeSubscriptionId: string,
  status: Database["public"]["Tables"]["subscriptions"]["Insert"]["status"]
) {
  return {
    user_id: userId,
    stripe_customer_id: `cus_${stripeSubscriptionId}`,
    stripe_subscription_id: stripeSubscriptionId,
    status,
    rank_code: "standard",
    current_period_start: "2026-06-01T00:00:00.000Z",
    current_period_end: "2026-07-01T00:00:00.000Z",
    canceled_at: status === "canceled" ? "2026-05-01T00:00:00.000Z" : null,
  };
}

async function insert<T extends keyof Database["public"]["Tables"]>(
  table: T,
  rows: Database["public"]["Tables"][T]["Insert"][]
) {
  const { error } = await supabase.from(table).insert(rows as never);
  if (error) throw error;
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
    {
      id: OTHER_USER_ID,
      clerk_user_id: CLERK_OTHER_USER,
      email: `${CLERK_OTHER_USER}@example.com`,
      first_name: "テスト",
      last_name: "次郎",
      rank_code: "basic",
      onboarding_completed: true,
      billing_anchor_day: 10,
    },
    {
      id: WITHDRAWN_USER_ID,
      clerk_user_id: CLERK_WITHDRAWN_USER,
      email: `${CLERK_WITHDRAWN_USER}@example.com`,
      first_name: "テスト",
      last_name: "三郎",
      rank_code: "basic",
      onboarding_completed: true,
      billing_anchor_day: 10,
      deleted_at: "2026-07-01T00:00:00.000Z",
    },
    {
      id: HISTORY_USER_ID,
      clerk_user_id: CLERK_HISTORY_USER,
      email: `${CLERK_HISTORY_USER}@example.com`,
      first_name: "テスト",
      last_name: "四郎",
      rank_code: "standard",
      onboarding_completed: true,
      billing_anchor_day: 10,
    },
  ]);
  // 注文確認の会員は支払い失敗中（過去に解約・失効した行も残っている）、他の会員は通常。
  // 注文履歴の会員はサブスクリプションの行が無い
  await insert("subscriptions", [
    subscription(USER_ID, "sub_test_member_order_query_old", "canceled"),
    subscription(
      USER_ID,
      "sub_test_member_order_query_expired",
      "incomplete_expired"
    ),
    subscription(USER_ID, "sub_test_member_order_query", "past_due"),
    subscription(OTHER_USER_ID, "sub_test_member_order_query_other", "active"),
  ]);
  await insert("addresses", [
    address(SHIPPING_OTHER_ID, USER_ID, "shipping", false, "港区"),
    address(SHIPPING_DEFAULT_ID, USER_ID, "shipping", true, "千代田区"),
    address(BILLING_ID, USER_ID, "billing", true, "中央区"),
    address(OTHER_USER_ADDRESS_ID, OTHER_USER_ID, "shipping", true, "新宿区"),
  ]);
  await insert("orders", [
    order(MIXED_ORDER_ID),
    order(AT_ORDER_ONLY_ORDER_ID),
    order(WITHDRAWN_USER_ORDER_ID, WITHDRAWN_USER_ID),
    order(HISTORY_PAID_ORDER_ID, HISTORY_USER_ID, {
      status: "paid",
      createdAt: "2026-07-01T00:00:00.000Z",
    }),
    order(HISTORY_CANCELLED_ORDER_ID, HISTORY_USER_ID, {
      status: "cancelled",
      createdAt: "2026-08-01T00:00:00.000Z",
    }),
    order(HISTORY_LIMIT_EXCEEDED_ORDER_ID, HISTORY_USER_ID, {
      status: "limit_exceeded",
      createdAt: "2026-09-01T00:00:00.000Z",
    }),
    order(HISTORY_PROCESSING_ORDER_ID, HISTORY_USER_ID, {
      status: "processing",
      createdAt: "2026-10-01T00:00:00.000Z",
    }),
    {
      ...order(DETAIL_ORDER_ID),
      billing_address_snapshot: {
        ...addressSnapshot,
        recipientLastName: "請求",
        recipientFirstName: "花子",
        city: "中央区",
        addressLine2: "テストビル3F",
      },
    },
  ]);
  await insert("order_settlements", [
    {
      id: MIXED_SETTLEMENT_ID,
      order_id: MIXED_ORDER_ID,
      flow: "checkout",
      status: "pending_payment",
      stripe_checkout_session_id: SESSION_ID,
      amount_snapshot: 100_000,
    },
    {
      id: AT_ORDER_ONLY_SETTLEMENT_ID,
      order_id: AT_ORDER_ONLY_ORDER_ID,
      flow: "checkout",
      status: "pending_payment",
      stripe_checkout_session_id: AT_ORDER_ONLY_SESSION_ID,
      amount_snapshot: 100_000,
    },
    {
      id: WITHDRAWN_USER_SETTLEMENT_ID,
      order_id: WITHDRAWN_USER_ORDER_ID,
      flow: "checkout",
      status: "pending_payment",
      stripe_checkout_session_id: WITHDRAWN_USER_SESSION_ID,
      amount_snapshot: 100_000,
    },
  ]);
  // created_at を指定するため、列のそろった別の insert にする。作成順に並ぶことを確かめるため、後に作った Invoice を先に入れる
  await insert("order_settlements", [
    {
      id: DETAIL_INVOICE_SETTLEMENT_ID,
      order_id: DETAIL_ORDER_ID,
      flow: "invoice",
      status: "invoice_sent",
      stripe_invoice_id: "in_test_member_order_query_365",
      amount_snapshot: 30_000,
      created_at: "2026-06-20T00:00:00.000Z",
    },
    {
      id: DETAIL_CHECKOUT_SETTLEMENT_ID,
      order_id: DETAIL_ORDER_ID,
      flow: "checkout",
      status: "paid",
      stripe_checkout_session_id: "cs_test_member_order_query_365",
      amount_snapshot: 100_000,
      paid_at: CREATED_AT,
      created_at: CREATED_AT,
    },
  ]);
  await insert("order_items", [
    item(AT_ORDER_ITEM_ID, MIXED_ORDER_ID, {
      product_name_snapshot: "注文時に支払う商品",
      settlement_id: MIXED_SETTLEMENT_ID,
    }),
    item(AFTER_ORDER_ITEM_ID, MIXED_ORDER_ID, {
      product_name_snapshot: "後払いの商品",
      unit_price_snapshot: 30_000,
      quantity: 1,
      payment_timing: "after_order",
    }),
    item(NEGOTIABLE_AFTER_ORDER_ITEM_ID, MIXED_ORDER_ID, {
      product_name_snapshot: "価格要相談の商品",
      unit_price_snapshot: null,
      quantity: 3,
      is_negotiable: true,
      payment_timing: "after_order",
    }),
    item(AT_ORDER_ONLY_ITEM_ID, AT_ORDER_ONLY_ORDER_ID, {
      settlement_id: AT_ORDER_ONLY_SETTLEMENT_ID,
    }),
    item(WITHDRAWN_USER_ITEM_ID, WITHDRAWN_USER_ORDER_ID, {
      payment_timing: "after_order",
      settlement_id: WITHDRAWN_USER_SETTLEMENT_ID,
    }),
    // 注文履歴の明細。決済単位は履歴の表示に使わないため紐付けない
    item("00000000-0000-0000-0000-000000364a41", HISTORY_PAID_ORDER_ID, {
      unit_price_snapshot: 10_000,
      quantity: 3,
    }),
    item("00000000-0000-0000-0000-000000364a42", HISTORY_PAID_ORDER_ID, {
      unit_price_snapshot: 5_000,
      quantity: 1,
      payment_timing: "after_order",
    }),
    item("00000000-0000-0000-0000-000000364a43", HISTORY_CANCELLED_ORDER_ID, {
      unit_price_snapshot: 20_000,
      quantity: 1,
    }),
    item(
      "00000000-0000-0000-0000-000000364a44",
      HISTORY_LIMIT_EXCEEDED_ORDER_ID,
      {
        unit_price_snapshot: 40_000,
        quantity: 2,
        payment_timing: "after_order",
      }
    ),
    item("00000000-0000-0000-0000-000000364a45", HISTORY_PROCESSING_ORDER_ID, {
      unit_price_snapshot: 8_000,
      quantity: 2,
    }),
    item("00000000-0000-0000-0000-000000364a46", HISTORY_PROCESSING_ORDER_ID, {
      unit_price_snapshot: null,
      quantity: 1,
      is_negotiable: true,
      negotiated_unit_price: 99_000,
      payment_timing: "after_order",
    }),
    item(DETAIL_CHECKOUT_ITEM_ID, DETAIL_ORDER_ID, {
      product_name_snapshot: "注文時に支払った商品",
      settlement_id: DETAIL_CHECKOUT_SETTLEMENT_ID,
    }),
    item(DETAIL_INVOICE_ITEM_ID, DETAIL_ORDER_ID, {
      product_name_snapshot: "請求書で支払う商品",
      unit_price_snapshot: 30_000,
      quantity: 1,
      payment_timing: "after_order",
      settlement_id: DETAIL_INVOICE_SETTLEMENT_ID,
    }),
    // 請求前（まだ決済単位が無い）。要相談のため交渉済みの単価があっても単価は出さない
    item(DETAIL_UNASSIGNED_ITEM_ID, DETAIL_ORDER_ID, {
      product_name_snapshot: "これから請求する商品",
      unit_price_snapshot: null,
      quantity: 4,
      is_negotiable: true,
      negotiated_unit_price: 7_000,
      payment_timing: "after_order",
    }),
  ]);
  // 注文詳細の申請できる数量（#381）: 申請中の申請の分は引き、却下された申請の分は引かない
  await insert("returns", [
    {
      id: DETAIL_REQUESTED_RETURN_ID,
      order_id: DETAIL_ORDER_ID,
      status: "requested",
      requested_by_user_id: USER_ID,
      reason: "不良品",
    },
    {
      id: DETAIL_REJECTED_RETURN_ID,
      order_id: DETAIL_ORDER_ID,
      status: "rejected",
      requested_by_user_id: USER_ID,
      reason: "不良品",
    },
  ]);
  await insert("return_items", [
    {
      return_id: DETAIL_REQUESTED_RETURN_ID,
      order_item_id: DETAIL_CHECKOUT_ITEM_ID,
      quantity: 1,
    },
    {
      return_id: DETAIL_REQUESTED_RETURN_ID,
      order_item_id: DETAIL_INVOICE_ITEM_ID,
      quantity: 1,
    },
    {
      return_id: DETAIL_REJECTED_RETURN_ID,
      order_item_id: DETAIL_UNASSIGNED_ITEM_ID,
      quantity: 4,
    },
  ]);
});

afterAll(cleanup);

const queryService = new SupabaseMemberOrderQueryService(supabase);

const atOrderItem = {
  id: AT_ORDER_ITEM_ID,
  productNameSnapshot: "注文時に支払う商品",
  quantity: 2,
  unitPriceSnapshot: 50_000,
  isNegotiable: false,
};
const afterOrderItem = {
  id: AFTER_ORDER_ITEM_ID,
  productNameSnapshot: "後払いの商品",
  quantity: 1,
  unitPriceSnapshot: 30_000,
  isNegotiable: false,
};
const negotiableAfterOrderItem = {
  id: NEGOTIABLE_AFTER_ORDER_ITEM_ID,
  productNameSnapshot: "価格要相談の商品",
  quantity: 3,
  unitPriceSnapshot: null,
  isNegotiable: true,
};

const byId = <T extends { id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

describe("SupabaseMemberOrderQueryService.findCheckout", () => {
  it("会員のランクと、配送先・請求先に分けた住所（既定の住所が先頭）を返す", async () => {
    const checkout = await queryService.findCheckout(CLERK_USER);

    expect(checkout?.rank.value).toBe("standard");
    expect(checkout?.shippingAddresses).toEqual([
      {
        id: SHIPPING_DEFAULT_ID,
        isDefault: true,
        recipientLastName: "テスト",
        recipientFirstName: "太郎",
        postalCode: "100-0001",
        prefecture: "東京都",
        city: "千代田区",
        addressLine1: "丸の内1-1-1",
      },
      expect.objectContaining({ id: SHIPPING_OTHER_ID, isDefault: false }),
    ]);
    expect(checkout?.billingAddresses).toEqual([
      expect.objectContaining({ id: BILLING_ID, city: "中央区" }),
    ]);
  });

  it("他の会員の住所を含めない", async () => {
    const checkout = await queryService.findCheckout(CLERK_OTHER_USER);

    expect(checkout?.shippingAddresses.map((a) => a.id)).toEqual([
      OTHER_USER_ADDRESS_ID,
    ]);
    expect(checkout?.billingAddresses).toEqual([]);
  });

  it("解約済みでないサブスクリプションが支払い失敗中（past_due）なら paymentFailed が true", async () => {
    const checkout = await queryService.findCheckout(CLERK_USER);

    expect(checkout?.paymentFailed).toBe(true);
  });

  it("サブスクリプションが active なら paymentFailed が false", async () => {
    const checkout = await queryService.findCheckout(CLERK_OTHER_USER);

    expect(checkout?.paymentFailed).toBe(false);
  });

  it("サブスクリプションの行が無い会員は paymentFailed が false", async () => {
    const checkout = await queryService.findCheckout(CLERK_HISTORY_USER);

    expect(checkout?.paymentFailed).toBe(false);
  });

  it("存在しない会員は null", async () => {
    expect(await queryService.findCheckout("clerk_test_not_exists")).toBeNull();
  });

  it("退会済みの会員は null", async () => {
    expect(await queryService.findCheckout(CLERK_WITHDRAWN_USER)).toBeNull();
  });
});

describe("SupabaseMemberOrderQueryService.findCheckoutCompletedOrder", () => {
  it("Checkout Session の注文を、注文時に支払う明細と後払いの明細に分けて返す", async () => {
    const order = await queryService.findCheckoutCompletedOrder({
      clerkUserId: CLERK_USER,
      stripeCheckoutSessionId: SESSION_ID,
    });

    expect(order).toEqual({
      orderId: MIXED_ORDER_ID,
      createdAt: CREATED_AT,
      atOrderItems: [atOrderItem],
      afterOrderItems: expect.any(Array),
    });
    expect(order?.afterOrderItems.sort(byId)).toEqual([
      afterOrderItem,
      negotiableAfterOrderItem,
    ]);
  });

  it("他の会員の Checkout Session は null", async () => {
    expect(
      await queryService.findCheckoutCompletedOrder({
        clerkUserId: CLERK_OTHER_USER,
        stripeCheckoutSessionId: SESSION_ID,
      })
    ).toBeNull();
  });

  it("退会済みの会員の Checkout Session は null", async () => {
    expect(
      await queryService.findCheckoutCompletedOrder({
        clerkUserId: CLERK_WITHDRAWN_USER,
        stripeCheckoutSessionId: WITHDRAWN_USER_SESSION_ID,
      })
    ).toBeNull();
  });

  it("存在しない Checkout Session は null", async () => {
    expect(
      await queryService.findCheckoutCompletedOrder({
        clerkUserId: CLERK_USER,
        stripeCheckoutSessionId: "cs_test_not_exists",
      })
    ).toBeNull();
  });
});

describe("SupabaseMemberOrderQueryService.findInvoiceRequestedOrder", () => {
  it("注文の後払いの明細だけを返す", async () => {
    const order = await queryService.findInvoiceRequestedOrder({
      clerkUserId: CLERK_USER,
      orderId: MIXED_ORDER_ID,
    });

    expect(order).toEqual({
      orderId: MIXED_ORDER_ID,
      createdAt: CREATED_AT,
      items: expect.any(Array),
    });
    expect(order?.items.sort(byId)).toEqual([
      afterOrderItem,
      negotiableAfterOrderItem,
    ]);
  });

  it("後払いの明細が無い注文は null", async () => {
    expect(
      await queryService.findInvoiceRequestedOrder({
        clerkUserId: CLERK_USER,
        orderId: AT_ORDER_ONLY_ORDER_ID,
      })
    ).toBeNull();
  });

  it("他の会員の注文は null", async () => {
    expect(
      await queryService.findInvoiceRequestedOrder({
        clerkUserId: CLERK_OTHER_USER,
        orderId: MIXED_ORDER_ID,
      })
    ).toBeNull();
  });

  it("退会済みの会員の注文は null", async () => {
    expect(
      await queryService.findInvoiceRequestedOrder({
        clerkUserId: CLERK_WITHDRAWN_USER,
        orderId: WITHDRAWN_USER_ORDER_ID,
      })
    ).toBeNull();
  });

  it("存在しない注文は null", async () => {
    expect(
      await queryService.findInvoiceRequestedOrder({
        clerkUserId: CLERK_USER,
        orderId: "00000000-0000-0000-0000-000000450fff",
      })
    ).toBeNull();
  });

  it("UUID の形でない注文ID（URL の改ざん等）は null", async () => {
    expect(
      await queryService.findInvoiceRequestedOrder({
        clerkUserId: CLERK_USER,
        orderId: "not-a-uuid",
      })
    ).toBeNull();
  });
});

describe("SupabaseMemberOrderQueryService.findOrderHistory", () => {
  const historyRow = (
    orderId: string,
    createdAt: string,
    rest: {
      status: string;
      fixedTotal: number;
      includesNegotiable: boolean;
      itemCount: number;
    }
  ) => ({ orderId, createdAt, ...rest });

  const processing = historyRow(
    HISTORY_PROCESSING_ORDER_ID,
    "2026-10-01T00:00:00.000Z",
    // 要相談の明細は交渉済みの単価があっても固定額に含めない（sumFixedTotal）
    {
      status: "processing",
      fixedTotal: 16_000,
      includesNegotiable: true,
      itemCount: 3,
    }
  );
  const limitExceeded = historyRow(
    HISTORY_LIMIT_EXCEEDED_ORDER_ID,
    "2026-09-01T00:00:00.000Z",
    {
      status: "limit_exceeded",
      fixedTotal: 80_000,
      includesNegotiable: false,
      itemCount: 2,
    }
  );
  const cancelled = historyRow(
    HISTORY_CANCELLED_ORDER_ID,
    "2026-08-01T00:00:00.000Z",
    {
      status: "cancelled",
      fixedTotal: 20_000,
      includesNegotiable: false,
      itemCount: 1,
    }
  );
  const paid = historyRow(
    HISTORY_PAID_ORDER_ID,
    "2026-07-01T00:00:00.000Z",
    // 注文時に支払う明細と後払いの明細の両方を合計する
    {
      status: "paid",
      fixedTotal: 35_000,
      includesNegotiable: false,
      itemCount: 4,
    }
  );

  // status は値オブジェクトのため、比較用に値へ直す
  const plain = (
    history: Awaited<ReturnType<typeof queryService.findOrderHistory>>
  ) => ({
    ...history,
    orders: history.orders.map((o) => ({ ...o, status: o.status.value })),
  });

  it("本人の注文を、キャンセル済み・支払い済みも含めて新しい順に返す", async () => {
    const history = await queryService.findOrderHistory({
      clerkUserId: CLERK_HISTORY_USER,
      page: 1,
      pageSize: 10,
    });

    expect(plain(history)).toEqual({
      orders: [processing, limitExceeded, cancelled, paid],
      totalCount: 4,
      page: 1,
      pageSize: 10,
    });
  });

  it("ページ単位で返し、2ページ目以降で古い注文までたどれる", async () => {
    const first = await queryService.findOrderHistory({
      clerkUserId: CLERK_HISTORY_USER,
      page: 1,
      pageSize: 3,
    });
    const second = await queryService.findOrderHistory({
      clerkUserId: CLERK_HISTORY_USER,
      page: 2,
      pageSize: 3,
    });

    expect(plain(first)).toEqual({
      orders: [processing, limitExceeded, cancelled],
      totalCount: 4,
      page: 1,
      pageSize: 3,
    });
    expect(plain(second)).toEqual({
      orders: [paid],
      totalCount: 4,
      page: 2,
      pageSize: 3,
    });
  });

  it("最後のページより後のページは、注文を空で返す", async () => {
    const history = await queryService.findOrderHistory({
      clerkUserId: CLERK_HISTORY_USER,
      page: 3,
      pageSize: 3,
    });

    expect(history.orders).toEqual([]);
    expect(history.totalCount).toBe(4);
  });

  it("他の会員の注文を含めない", async () => {
    const history = await queryService.findOrderHistory({
      clerkUserId: CLERK_OTHER_USER,
      page: 1,
      pageSize: 10,
    });

    expect(history).toEqual({
      orders: [],
      totalCount: 0,
      page: 1,
      pageSize: 10,
    });
  });

  it("退会済みの会員の注文は返さない", async () => {
    const history = await queryService.findOrderHistory({
      clerkUserId: CLERK_WITHDRAWN_USER,
      page: 1,
      pageSize: 10,
    });

    expect(history.orders).toEqual([]);
    expect(history.totalCount).toBe(0);
  });

  it("存在しない会員は、注文を空で返す", async () => {
    const history = await queryService.findOrderHistory({
      clerkUserId: "clerk_test_not_exists",
      page: 1,
      pageSize: 10,
    });

    expect(history.orders).toEqual([]);
    expect(history.totalCount).toBe(0);
  });
});

describe("SupabaseMemberOrderQueryService.findOrderDetail", () => {
  // status・rankAtOrder は値オブジェクトのため、比較用に値へ直す
  const plain = (
    detail: Awaited<ReturnType<typeof queryService.findOrderDetail>>
  ) =>
    detail && {
      ...detail,
      status: detail.status.value,
      rankAtOrder: detail.rankAtOrder.value,
    };

  it("明細・住所のスナップショット・注文時点のランクと、決済単位ごとの状態・金額・明細、請求前の明細を返す", async () => {
    const detail = await queryService.findOrderDetail({
      clerkUserId: CLERK_USER,
      orderId: DETAIL_ORDER_ID,
    });

    expect(plain(detail)).toEqual({
      orderId: DETAIL_ORDER_ID,
      createdAt: CREATED_AT,
      status: "processing",
      rankAtOrder: "standard",
      shippingAddress: {
        fullName: "テスト 太郎",
        postalCode: "100-0001",
        prefecture: "東京都",
        city: "千代田区",
        addressLine1: "丸の内1-1-1",
        addressLine2: "",
        phoneNumber: "03-1234-5678",
      },
      billingAddress: {
        fullName: "請求 花子",
        postalCode: "100-0001",
        prefecture: "東京都",
        city: "中央区",
        addressLine1: "丸の内1-1-1",
        addressLine2: "テストビル3F",
        phoneNumber: "03-1234-5678",
      },
      // 決済単位は作成順
      settlements: [
        {
          id: DETAIL_CHECKOUT_SETTLEMENT_ID,
          flow: "checkout",
          flowLabel: "注文時のお支払い",
          status: "paid",
          statusLabel: "お支払い済み",
          amount: 100_000,
          items: [
            {
              id: DETAIL_CHECKOUT_ITEM_ID,
              productNameSnapshot: "注文時に支払った商品",
              quantity: 2,
              unitPriceSnapshot: 50_000,
              isNegotiable: false,
            },
          ],
        },
        {
          id: DETAIL_INVOICE_SETTLEMENT_ID,
          flow: "invoice",
          flowLabel: "請求書払い",
          status: "invoice_sent",
          statusLabel: "請求書をお送りしました（お支払い待ち）",
          amount: 30_000,
          items: [
            {
              id: DETAIL_INVOICE_ITEM_ID,
              productNameSnapshot: "請求書で支払う商品",
              quantity: 1,
              unitPriceSnapshot: 30_000,
              isNegotiable: false,
            },
          ],
        },
      ],
      unassignedItems: [
        {
          id: DETAIL_UNASSIGNED_ITEM_ID,
          productNameSnapshot: "これから請求する商品",
          quantity: 4,
          unitPriceSnapshot: null,
          isNegotiable: true,
        },
      ],
      // 支払い済みの Checkout の明細と後払いの明細。全数量が申請中の明細は含めない
      returnableItems: [
        {
          id: DETAIL_CHECKOUT_ITEM_ID,
          productNameSnapshot: "注文時に支払った商品",
          returnableQuantity: 1,
        },
        {
          id: DETAIL_UNASSIGNED_ITEM_ID,
          productNameSnapshot: "これから請求する商品",
          returnableQuantity: 4,
        },
      ],
    });
  });

  it("支払い完了前の注文時に支払う明細（パターン①）は、申請できる明細に含めない", async () => {
    const detail = await queryService.findOrderDetail({
      clerkUserId: CLERK_USER,
      orderId: MIXED_ORDER_ID,
    });

    expect(detail?.returnableItems.map((i) => i.id).sort()).toEqual(
      [AFTER_ORDER_ITEM_ID, NEGOTIABLE_AFTER_ORDER_ITEM_ID].sort()
    );
  });

  it("他の会員の注文は null", async () => {
    expect(
      await queryService.findOrderDetail({
        clerkUserId: CLERK_OTHER_USER,
        orderId: DETAIL_ORDER_ID,
      })
    ).toBeNull();
  });

  it("退会済みの会員の注文は null", async () => {
    expect(
      await queryService.findOrderDetail({
        clerkUserId: CLERK_WITHDRAWN_USER,
        orderId: WITHDRAWN_USER_ORDER_ID,
      })
    ).toBeNull();
  });

  it("存在しない注文は null", async () => {
    expect(
      await queryService.findOrderDetail({
        clerkUserId: CLERK_USER,
        orderId: "00000000-0000-0000-0000-000000365fff",
      })
    ).toBeNull();
  });

  it("UUID の形でない注文ID（URL の改ざん等）は null", async () => {
    expect(
      await queryService.findOrderDetail({
        clerkUserId: CLERK_USER,
        orderId: "not-a-uuid",
      })
    ).toBeNull();
  });
});

// page が使う組み立て。ログイン中の会員のトークンで RLS を効かせたクライアントでも取得できること
describe("memberOrderQueryService（composition。RLS 付きのクライアント）", () => {
  it("ログイン中の会員の注文確認・注文完了・後払いの注文完了を取得できる", async () => {
    getToken.mockResolvedValue(signTestJwt(CLERK_USER));
    const rlsQueryService = await memberOrderQueryService();

    const checkout = await rlsQueryService.findCheckout(CLERK_USER);
    expect(checkout?.shippingAddresses.map((a) => a.id)).toEqual([
      SHIPPING_DEFAULT_ID,
      SHIPPING_OTHER_ID,
    ]);
    expect(checkout?.paymentFailed).toBe(true);
    expect(
      await rlsQueryService.findCheckoutCompletedOrder({
        clerkUserId: CLERK_USER,
        stripeCheckoutSessionId: SESSION_ID,
      })
    ).toMatchObject({ orderId: MIXED_ORDER_ID, atOrderItems: [atOrderItem] });
    expect(
      await rlsQueryService.findInvoiceRequestedOrder({
        clerkUserId: CLERK_USER,
        orderId: MIXED_ORDER_ID,
      })
    ).toMatchObject({ orderId: MIXED_ORDER_ID });
  });

  it("ログイン中の会員の注文履歴を取得できる", async () => {
    getToken.mockResolvedValue(signTestJwt(CLERK_HISTORY_USER));
    const rlsQueryService = await memberOrderQueryService();

    const history = await rlsQueryService.findOrderHistory({
      clerkUserId: CLERK_HISTORY_USER,
      page: 1,
      pageSize: 10,
    });
    expect(history.orders.map((o) => o.orderId)).toEqual([
      HISTORY_PROCESSING_ORDER_ID,
      HISTORY_LIMIT_EXCEEDED_ORDER_ID,
      HISTORY_CANCELLED_ORDER_ID,
      HISTORY_PAID_ORDER_ID,
    ]);
    expect(history.totalCount).toBe(4);
  });

  it("ログイン中の会員の注文詳細を取得できる", async () => {
    getToken.mockResolvedValue(signTestJwt(CLERK_USER));
    const rlsQueryService = await memberOrderQueryService();

    const detail = await rlsQueryService.findOrderDetail({
      clerkUserId: CLERK_USER,
      orderId: DETAIL_ORDER_ID,
    });
    expect(detail?.settlements.map((s) => s.id)).toEqual([
      DETAIL_CHECKOUT_SETTLEMENT_ID,
      DETAIL_INVOICE_SETTLEMENT_ID,
    ]);
    expect(detail?.unassignedItems.map((i) => i.id)).toEqual([
      DETAIL_UNASSIGNED_ITEM_ID,
    ]);
    // 会員が読めるカラムだけで申請を読み、申請中の分を引いた数量を返す
    expect(detail?.returnableItems).toEqual([
      expect.objectContaining({
        id: DETAIL_CHECKOUT_ITEM_ID,
        returnableQuantity: 1,
      }),
      expect.objectContaining({
        id: DETAIL_UNASSIGNED_ITEM_ID,
        returnableQuantity: 4,
      }),
    ]);
  });

  it("引数に他の会員を渡しても、RLS によりトークンの会員以外のデータは取得できない", async () => {
    getToken.mockResolvedValue(signTestJwt(CLERK_OTHER_USER));
    const rlsQueryService = await memberOrderQueryService();

    expect(await rlsQueryService.findCheckout(CLERK_USER)).toBeNull();
    expect(
      await rlsQueryService.findCheckoutCompletedOrder({
        clerkUserId: CLERK_USER,
        stripeCheckoutSessionId: SESSION_ID,
      })
    ).toBeNull();
    expect(
      await rlsQueryService.findInvoiceRequestedOrder({
        clerkUserId: CLERK_USER,
        orderId: MIXED_ORDER_ID,
      })
    ).toBeNull();
    const history = await rlsQueryService.findOrderHistory({
      clerkUserId: CLERK_HISTORY_USER,
      page: 1,
      pageSize: 10,
    });
    expect(history.orders).toEqual([]);
    expect(history.totalCount).toBe(0);
    expect(
      await rlsQueryService.findOrderDetail({
        clerkUserId: CLERK_USER,
        orderId: DETAIL_ORDER_ID,
      })
    ).toBeNull();
  });
});
