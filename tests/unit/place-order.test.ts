import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@clerk/nextjs/server", () => ({ auth: vi.fn() }));
vi.mock("@/lib/supabase/server-admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ getStripe: vi.fn() }));
vi.mock("@/lib/sanity/products", () => ({ fetchProductsByIds: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { auth } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/server-admin";
import { getStripe } from "@/lib/stripe";
import { fetchProductsByIds } from "@/lib/sanity/products";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { placeOrder } from "@/app/(member)/order/checkout/actions";
import { checkMonthlyLimit } from "@/app/(member)/order/checkout/monthly-limit";

// -----------------------------------------------
// checkMonthlyLimit ユニットテスト
// -----------------------------------------------

describe("checkMonthlyLimit", () => {
  it("上限内ならundefinedを返す", () => {
    expect(checkMonthlyLimit(0, 10_000, 100_000)).toBeUndefined();
  });

  it("上限を超えるとエラーメッセージを返す", () => {
    const result = checkMonthlyLimit(90_000, 20_000, 100_000);
    expect(result).toContain("100,000");
  });

  it("monthlyLimit=0（制限なし）はundefinedを返す", () => {
    expect(checkMonthlyLimit(0, 999_999, 0)).toBeUndefined();
  });

  it("monthlyLimit=MAX_SAFE_INTEGER（無制限）はundefinedを返す", () => {
    expect(
      checkMonthlyLimit(0, 999_999_999, Number.MAX_SAFE_INTEGER)
    ).toBeUndefined();
  });

  it("ちょうど上限と同額ならundefinedを返す（以下はOK）", () => {
    expect(checkMonthlyLimit(0, 100_000, 100_000)).toBeUndefined();
  });

  it("1円でも超えるとエラーを返す", () => {
    expect(checkMonthlyLimit(0, 100_001, 100_000)).toBeTruthy();
  });
});

// -----------------------------------------------
// placeOrder 統合テスト
// -----------------------------------------------

const PRODUCTS = [
  {
    _id: "prod_1",
    name: "商品A",
    is_negotiable: false,
    prices: { entry: 10_000 },
    availability: "available",
    thumbnail: null,
  },
];

const NEGOTIABLE_PRODUCTS = [
  {
    _id: "prod_neg",
    name: "要相談商品A",
    is_negotiable: true,
    prices: {},
    availability: "available",
    thumbnail: null,
  },
];

const CART_COOKIE = encodeURIComponent(
  JSON.stringify({
    items: [
      {
        productId: "prod_1",
        productName: "商品A",
        quantity: 2,
        unitPrice: 10_000,
        availability: "available",
        thumbnail: null,
      },
    ],
  })
);

const NEGOTIABLE_CART_COOKIE = encodeURIComponent(
  JSON.stringify({
    items: [
      {
        productId: "prod_neg",
        productName: "要相談商品A",
        quantity: 1,
        unitPrice: null,
        availability: "available",
        thumbnail: null,
      },
    ],
  })
);

const SHIPPING_ADDR = {
  id: "addr_ship",
  recipient_last_name: "山田",
  recipient_first_name: "太郎",
  postal_code: "1500001",
  prefecture: "東京都",
  city: "渋谷区",
  address_line1: "神南1-1-1",
  address_line2: null,
  phone_number: "09012345678",
  type: "shipping",
  is_default: true,
  user_id: "db_user_1",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

function setupAuth(userId: string | null = "clerk_user_1") {
  vi.mocked(auth).mockResolvedValue({ userId } as never);
}

function setupCookies(cartValue?: string) {
  vi.mocked(cookies).mockResolvedValue({
    get: vi
      .fn()
      .mockReturnValue(
        cartValue !== undefined ? { value: cartValue } : undefined
      ),
  } as never);
}

function buildSupabaseMock({
  orderItemsInsertError = null as unknown,
  orderUpdateError = null as unknown,
} = {}) {
  const orderDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const orderItemsDeleteEq = vi.fn().mockResolvedValue({ error: null });
  const orderInsertFn = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: { id: "order_1" },
        error: null,
      }),
    }),
  });
  const orderItemsInsertFn = vi
    .fn()
    .mockResolvedValue({ error: orderItemsInsertError });

  vi.mocked(createAdminClient).mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "users")
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "db_user_1", rank: "entry", subscribed_at: null },
              }),
            }),
          }),
        };
      if (table === "orders")
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  lt: vi.fn().mockResolvedValue({ data: [] }),
                }),
              }),
            }),
          }),
          insert: orderInsertFn,
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: orderUpdateError }),
          }),
          delete: vi.fn().mockReturnValue({ eq: orderDeleteEq }),
        };
      if (table === "order_items")
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
          insert: orderItemsInsertFn,
          delete: vi.fn().mockReturnValue({ eq: orderItemsDeleteEq }),
        };
      if (table === "addresses")
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: SHIPPING_ADDR }),
            }),
          }),
        };
      return {};
    }),
  } as never);

  return {
    orderDeleteEq,
    orderItemsDeleteEq,
    orderInsertFn,
    orderItemsInsertFn,
  };
}

function setupSupabaseForCheckout() {
  buildSupabaseMock();
}

describe("placeOrder", () => {
  beforeEach(() => vi.clearAllMocks());

  it("未認証の場合はエラーを返す", async () => {
    setupAuth(null);
    const result = await placeOrder("addr_ship", "addr_bill");
    expect(result).toEqual({ error: "認証されていません" });
  });

  it("カートが空の場合はエラーを返す", async () => {
    setupAuth();
    setupCookies(undefined);
    setupSupabaseForCheckout();
    const result = await placeOrder("addr_ship", "addr_bill");
    expect(result).toEqual({ error: "カートが空です" });
  });

  it("正常ケース(Checkout): 注文記録後にStripe Checkoutへリダイレクト", async () => {
    setupAuth();
    setupCookies(CART_COOKIE);
    setupSupabaseForCheckout();
    vi.mocked(fetchProductsByIds).mockResolvedValue(PRODUCTS as never);
    vi.mocked(getStripe).mockReturnValue({
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({
            id: "cs_1",
            url: "https://checkout.stripe.com/session_1",
          }),
        },
      },
    } as never);

    await placeOrder("addr_ship", "addr_bill");

    expect(redirect).toHaveBeenCalledWith(
      "https://checkout.stripe.com/session_1"
    );
  });
});

describe("placeOrder - エラーハンドリング（ロールバック）", () => {
  beforeEach(() => vi.clearAllMocks());

  function setupStripeSuccess() {
    vi.mocked(getStripe).mockReturnValue({
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({
            id: "cs_1",
            url: "https://checkout.stripe.com/session_1",
          }),
        },
      },
    } as never);
  }

  it("order_items INSERT失敗時はorderを削除してエラーを返す", async () => {
    setupAuth();
    setupCookies(CART_COOKIE);
    vi.mocked(fetchProductsByIds).mockResolvedValue(PRODUCTS as never);
    const { orderDeleteEq } = buildSupabaseMock({
      orderItemsInsertError: { message: "DB error" },
    });

    const result = await placeOrder("addr_ship", "addr_bill");

    expect(result).toEqual({ error: "注文明細の記録に失敗しました" });
    expect(orderDeleteEq).toHaveBeenCalledWith("id", "order_1");
  });

  it("Stripe Session作成失敗時はorder・order_itemsを削除してエラーを返す", async () => {
    setupAuth();
    setupCookies(CART_COOKIE);
    vi.mocked(fetchProductsByIds).mockResolvedValue(PRODUCTS as never);
    const { orderDeleteEq, orderItemsDeleteEq } = buildSupabaseMock();
    vi.mocked(getStripe).mockReturnValue({
      checkout: {
        sessions: {
          create: vi.fn().mockRejectedValue(new Error("Stripe error")),
        },
      },
    } as never);

    const result = await placeOrder("addr_ship", "addr_bill");

    expect(result).toEqual({
      error:
        "決済ページの作成に失敗しました。しばらく経ってから再度お試しください。",
    });
    expect(orderItemsDeleteEq).toHaveBeenCalledWith("order_id", "order_1");
    expect(orderDeleteEq).toHaveBeenCalledWith("id", "order_1");
  });

  it("stripe_checkout_session_id UPDATE失敗時はorder・order_itemsを削除してエラーを返す", async () => {
    setupAuth();
    setupCookies(CART_COOKIE);
    vi.mocked(fetchProductsByIds).mockResolvedValue(PRODUCTS as never);
    const { orderDeleteEq, orderItemsDeleteEq } = buildSupabaseMock({
      orderUpdateError: { message: "DB error" },
    });
    setupStripeSuccess();

    const result = await placeOrder("addr_ship", "addr_bill");

    expect(result).toEqual({
      error: "注文の記録に失敗しました。しばらく経ってから再度お試しください。",
    });
    expect(orderItemsDeleteEq).toHaveBeenCalledWith("order_id", "order_1");
    expect(orderDeleteEq).toHaveBeenCalledWith("id", "order_1");
  });
});

describe("placeOrder - Invoice フロー", () => {
  beforeEach(() => vi.clearAllMocks());

  it("要相談商品を含む注文を confirming で記録し invoice-complete へリダイレクト", async () => {
    setupAuth();
    setupCookies(NEGOTIABLE_CART_COOKIE);
    vi.mocked(fetchProductsByIds).mockResolvedValue(
      NEGOTIABLE_PRODUCTS as never
    );
    const { orderInsertFn } = buildSupabaseMock();

    await placeOrder("addr_ship", "addr_bill");

    expect(orderInsertFn).toHaveBeenCalledWith(
      expect.objectContaining({
        payment_flow: "invoice",
        status: "confirming",
      })
    );
    expect(redirect).toHaveBeenCalledWith(
      "/order/invoice-complete?order_id=order_1"
    );
  });

  it("要相談商品の unit_price_snapshot は NULL で記録される", async () => {
    setupAuth();
    setupCookies(NEGOTIABLE_CART_COOKIE);
    vi.mocked(fetchProductsByIds).mockResolvedValue(
      NEGOTIABLE_PRODUCTS as never
    );
    const mocks = buildSupabaseMock();

    await placeOrder("addr_ship", "addr_bill");

    expect(mocks.orderItemsInsertFn).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          is_negotiable: true,
          unit_price_snapshot: null,
        }),
      ])
    );
  });

  it("order_items INSERT失敗時はorderを削除してエラーを返す", async () => {
    setupAuth();
    setupCookies(NEGOTIABLE_CART_COOKIE);
    vi.mocked(fetchProductsByIds).mockResolvedValue(
      NEGOTIABLE_PRODUCTS as never
    );
    const { orderDeleteEq } = buildSupabaseMock({
      orderItemsInsertError: { message: "DB error" },
    });

    const result = await placeOrder("addr_ship", "addr_bill");

    expect(result).toEqual({ error: "注文明細の記録に失敗しました" });
    expect(orderDeleteEq).toHaveBeenCalledWith("id", "order_1");
  });
});
