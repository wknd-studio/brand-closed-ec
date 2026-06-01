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
import {
  placeOrder,
  checkMonthlyLimit,
} from "@/app/(member)/order/checkout/actions";

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

function setupSupabaseForCheckout() {
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
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: { id: "order_1" },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      if (table === "order_items")
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: [] }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ error: null }),
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
