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
const ALL_USER_IDS = [USER_ID, OTHER_USER_ID, WITHDRAWN_USER_ID];

const SHIPPING_DEFAULT_ID = "00000000-0000-0000-0000-000000450a11";
const SHIPPING_OTHER_ID = "00000000-0000-0000-0000-000000450a12";
const BILLING_ID = "00000000-0000-0000-0000-000000450a13";
const OTHER_USER_ADDRESS_ID = "00000000-0000-0000-0000-000000450b11";

const MIXED_ORDER_ID = "00000000-0000-0000-0000-000000450a21";
const AT_ORDER_ONLY_ORDER_ID = "00000000-0000-0000-0000-000000450a22";
const WITHDRAWN_USER_ORDER_ID = "00000000-0000-0000-0000-000000450c21";
const ALL_ORDER_IDS = [
  MIXED_ORDER_ID,
  AT_ORDER_ONLY_ORDER_ID,
  WITHDRAWN_USER_ORDER_ID,
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

function order(id: string, userId = USER_ID) {
  return {
    id,
    user_id: userId,
    status: "processing",
    shipping_address_snapshot: addressSnapshot,
    billing_address_snapshot: addressSnapshot,
    rank_at_order: "standard" as const,
    monthly_limit_at_order: 1_000_000,
    created_at: CREATED_AT,
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
  await supabase.from("order_items").delete().in("order_id", ALL_ORDER_IDS);
  await supabase
    .from("order_settlements")
    .delete()
    .in("order_id", ALL_ORDER_IDS);
  await supabase.from("orders").delete().in("id", ALL_ORDER_IDS);
  await supabase.from("addresses").delete().in("user_id", ALL_USER_IDS);
  await supabase.from("users").delete().in("id", ALL_USER_IDS);
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
  });
});
