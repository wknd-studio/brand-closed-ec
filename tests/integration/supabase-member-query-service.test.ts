import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";
import { SupabaseMemberQueryService } from "@/infrastructure/supabase/supabase-member-query-service";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

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

import { memberQueryService } from "@/composition/member-query";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID = "00000000-0000-0000-0000-000000453a01";
const OTHER_USER_ID = "00000000-0000-0000-0000-000000453b01";
const WITHDRAWN_USER_ID = "00000000-0000-0000-0000-000000453c01";
const CLERK_USER = "clerk_test_member_query";
const CLERK_OTHER_USER = "clerk_test_member_query_other";
const CLERK_WITHDRAWN_USER = "clerk_test_member_query_withdrawn";
// 決済は済んだが、入会の確定（Webhook）がまだの会員
const PENDING_USER_ID = "00000000-0000-0000-0000-000000453d01";
const CLERK_PENDING_USER = "clerk_test_member_query_pending";
const ALL_USER_IDS = [
  USER_ID,
  OTHER_USER_ID,
  WITHDRAWN_USER_ID,
  PENDING_USER_ID,
];

const SHIPPING_DEFAULT_ID = "00000000-0000-0000-0000-000000453a11";
const SHIPPING_OTHER_ID = "00000000-0000-0000-0000-000000453a12";
const BILLING_ID = "00000000-0000-0000-0000-000000453a13";
const OTHER_USER_ADDRESS_ID = "00000000-0000-0000-0000-000000453b11";
const WITHDRAWN_USER_ADDRESS_ID = "00000000-0000-0000-0000-000000453c11";

const ORDER_CONFIRMED_ID = "00000000-0000-0000-0000-000000453a21";
const ORDER_CANCELLED_ID = "00000000-0000-0000-0000-000000453a22";
// 注文自体は有効だが、明細の一部が紐づく決済単位だけがキャンセルされた注文（#444）
const ORDER_PARTIAL_ID = "00000000-0000-0000-0000-000000453a23";
const OTHER_USER_ORDER_ID = "00000000-0000-0000-0000-000000453b21";
const ALL_ORDER_IDS = [
  ORDER_CONFIRMED_ID,
  ORDER_CANCELLED_ID,
  ORDER_PARTIAL_ID,
  OTHER_USER_ORDER_ID,
];
const SETTLEMENT_PAID_ID = "00000000-0000-0000-0000-000000453a31";
const SETTLEMENT_CANCELLED_ID = "00000000-0000-0000-0000-000000453a32";

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
    address_line2: "1階",
    phone_number: "03-1234-5678",
  };
}

function order(
  id: string,
  userId: string,
  status: Database["public"]["Tables"]["orders"]["Insert"]["status"]
) {
  return {
    id,
    user_id: userId,
    status,
    rank_at_order: "advanced" as const,
    monthly_limit_at_order: 50_000_000,
    shipping_address_snapshot: addressSnapshot,
    billing_address_snapshot: addressSnapshot,
  };
}

function item(
  orderId: string,
  overrides: Partial<Database["public"]["Tables"]["order_items"]["Insert"]>
) {
  return {
    order_id: orderId,
    sanity_product_id: "prod-453",
    product_name_snapshot: "テスト商品",
    unit_price_snapshot: 1_000_000,
    quantity: 1,
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
  await supabase.from("favorites").delete().in("user_id", ALL_USER_IDS);
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
      rank_code: "advanced",
      onboarding_completed: true,
      billing_anchor_day: 1,
    },
    {
      id: OTHER_USER_ID,
      clerk_user_id: CLERK_OTHER_USER,
      stripe_customer_id: "cus_test_member_query_other",
      email: `${CLERK_OTHER_USER}@example.com`,
      first_name: "テスト",
      last_name: "次郎",
      rank_code: "basic",
      onboarding_completed: true,
      billing_anchor_day: 1,
    },
    {
      id: WITHDRAWN_USER_ID,
      clerk_user_id: CLERK_WITHDRAWN_USER,
      stripe_customer_id: "cus_test_member_query_withdrawn",
      email: `${CLERK_WITHDRAWN_USER}@example.com`,
      first_name: "テスト",
      last_name: "三郎",
      rank_code: "basic",
      onboarding_completed: true,
      billing_anchor_day: 1,
      deleted_at: "2026-07-01T00:00:00.000Z",
    },
    {
      id: PENDING_USER_ID,
      clerk_user_id: CLERK_PENDING_USER,
      stripe_customer_id: "cus_test_member_query_pending",
      email: `${CLERK_PENDING_USER}@example.com`,
      first_name: "テスト",
      last_name: "四郎",
      rank_code: "basic",
      onboarding_completed: false,
      billing_anchor_day: 1,
    },
  ]);
  await insert("addresses", [
    address(SHIPPING_OTHER_ID, USER_ID, "shipping", false, "港区"),
    address(SHIPPING_DEFAULT_ID, USER_ID, "shipping", true, "千代田区"),
    address(BILLING_ID, USER_ID, "billing", true, "中央区"),
    address(OTHER_USER_ADDRESS_ID, OTHER_USER_ID, "shipping", true, "新宿区"),
    address(
      WITHDRAWN_USER_ADDRESS_ID,
      WITHDRAWN_USER_ID,
      "shipping",
      true,
      "渋谷区"
    ),
  ]);
  await insert("favorites", [
    {
      user_id: USER_ID,
      sanity_product_id: "prod-old",
      created_at: "2026-06-01T00:00:00.000Z",
    },
    {
      user_id: USER_ID,
      sanity_product_id: "prod-new",
      created_at: "2026-06-02T00:00:00.000Z",
    },
    {
      user_id: OTHER_USER_ID,
      sanity_product_id: "prod-other",
      created_at: "2026-06-01T00:00:00.000Z",
    },
    {
      user_id: WITHDRAWN_USER_ID,
      sanity_product_id: "prod-withdrawn",
      created_at: "2026-06-01T00:00:00.000Z",
    },
  ]);
  await insert("orders", [
    order(ORDER_CONFIRMED_ID, USER_ID, "paid"),
    // キャンセル済み注文は確定額に含まれないことを確認するための対照データ
    order(ORDER_CANCELLED_ID, USER_ID, "cancelled"),
    order(ORDER_PARTIAL_ID, USER_ID, "paid"),
    order(OTHER_USER_ORDER_ID, OTHER_USER_ID, "paid"),
  ]);
  await insert("order_settlements", [
    {
      id: SETTLEMENT_PAID_ID,
      order_id: ORDER_PARTIAL_ID,
      flow: "checkout",
      status: "paid",
      amount_snapshot: 200_000,
    },
    {
      id: SETTLEMENT_CANCELLED_ID,
      order_id: ORDER_PARTIAL_ID,
      flow: "invoice",
      status: "cancelled",
      amount_snapshot: 7_000_000,
    },
  ]);
  await insert("order_items", [
    item(ORDER_CONFIRMED_ID, { quantity: 3 }),
    item(ORDER_CANCELLED_ID, { unit_price_snapshot: 100_000_000 }),
    item(ORDER_PARTIAL_ID, {
      settlement_id: SETTLEMENT_PAID_ID,
      unit_price_snapshot: 200_000,
    }),
    item(ORDER_PARTIAL_ID, {
      settlement_id: SETTLEMENT_CANCELLED_ID,
      unit_price_snapshot: 7_000_000,
    }),
    item(OTHER_USER_ORDER_ID, { unit_price_snapshot: 9_000 }),
  ]);
});

afterAll(cleanup);

const queryService = new SupabaseMemberQueryService(supabase);

describe("SupabaseMemberQueryService.findSettings", () => {
  it("会員の住所を、既定の住所を先にして返す", async () => {
    const settings = await queryService.findSettings(CLERK_USER);

    expect(settings?.addresses[0]).toEqual({
      id: expect.any(String),
      type: "shipping",
      isDefault: true,
      recipientLastName: "テスト",
      recipientFirstName: "太郎",
      postalCode: "100-0001",
      prefecture: "東京都",
      city: expect.any(String),
      addressLine1: "丸の内1-1-1",
      addressLine2: "1階",
      phoneNumber: "03-1234-5678",
    });
    expect(settings?.addresses.map((a) => a.isDefault)).toEqual([
      true,
      true,
      false,
    ]);
    expect(settings?.addresses.map((a) => a.id).sort()).toEqual(
      [SHIPPING_DEFAULT_ID, SHIPPING_OTHER_ID, BILLING_ID].sort()
    );
  });

  it("他の会員の住所を含めない", async () => {
    const settings = await queryService.findSettings(CLERK_OTHER_USER);

    expect(settings?.addresses.map((a) => a.id)).toEqual([
      OTHER_USER_ADDRESS_ID,
    ]);
  });

  it("存在しない会員は null", async () => {
    expect(await queryService.findSettings("clerk_test_not_exists")).toBeNull();
  });

  it("退会済みの会員は null", async () => {
    expect(await queryService.findSettings(CLERK_WITHDRAWN_USER)).toBeNull();
  });
});

describe("SupabaseMemberQueryService.findFavorites", () => {
  it("会員のランクと、お気に入りの商品ID（新しく登録した順）を返す", async () => {
    const favorites = await queryService.findFavorites(CLERK_USER);

    expect(favorites?.rank.value).toBe("advanced");
    expect(favorites?.favoriteProductIds).toEqual(["prod-new", "prod-old"]);
  });

  it("他の会員のお気に入りを含めない", async () => {
    const favorites = await queryService.findFavorites(CLERK_OTHER_USER);

    expect(favorites?.rank.value).toBe("basic");
    expect(favorites?.favoriteProductIds).toEqual(["prod-other"]);
  });

  it("存在しない会員は null", async () => {
    expect(
      await queryService.findFavorites("clerk_test_not_exists")
    ).toBeNull();
  });

  it("退会済みの会員は null", async () => {
    expect(await queryService.findFavorites(CLERK_WITHDRAWN_USER)).toBeNull();
  });
});

describe("SupabaseMemberQueryService.findMemberLayout", () => {
  it("ランクの月間上限と、お気に入りの商品IDを返す", async () => {
    const layout = await queryService.findMemberLayout(CLERK_USER);

    expect(layout?.monthlyLimit).toBe(50_000_000);
    expect(layout?.favoriteProductIds).toEqual(["prod-new", "prod-old"]);
  });

  it("キャンセル済み注文と、キャンセル済みの決済単位の明細を除いた確定額を返す（#444）", async () => {
    const layout = await queryService.findMemberLayout(CLERK_USER);

    expect(layout?.confirmedAmount).toBe(3_200_000);
  });

  it("確定額が、注文確定時の上限チェックで使う確定額（sumConfirmedAmountByUserId）と一致する", async () => {
    const layout = await queryService.findMemberLayout(CLERK_USER);
    const confirmedForLimitCheck = await new SupabaseOrderRepository(
      supabase
    ).sumConfirmedAmountByUserId(
      USER_ID,
      MonthlyPeriod.fromBillingAnchorDay(1)
    );

    expect(layout?.confirmedAmount).toBe(confirmedForLimitCheck);
  });

  it("他の会員の注文・お気に入りを含めない", async () => {
    const layout = await queryService.findMemberLayout(CLERK_OTHER_USER);

    expect(layout).toEqual({
      confirmedAmount: 9_000,
      monthlyLimit: expect.any(Number),
      favoriteProductIds: ["prod-other"],
    });
  });

  // 実際より少ない確定額（多い残額）を表示しないよう、0 円にせずエラーにする。
  // 投げた例外は onRequestError（instrumentation.ts）で Sentry に送られる（#597）
  it("確定額の集計がエラーになったときは、0 円にせず例外を投げる", async () => {
    const failingService = new SupabaseMemberQueryService(
      createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        {
          auth: { persistSession: false },
          global: {
            fetch: async (input, init) => {
              const url = new URL(input instanceof Request ? input.url : input);
              if (url.pathname === "/rest/v1/orders") {
                return new Response(
                  JSON.stringify({
                    code: "XX000",
                    message: "injected failure",
                  }),
                  {
                    status: 500,
                    headers: { "Content-Type": "application/json" },
                  }
                );
              }
              return fetch(input, init);
            },
          },
        }
      )
    );

    await expect(failingService.findMemberLayout(CLERK_USER)).rejects.toThrow(
      "確定額の集計に失敗"
    );
  });

  it("存在しない会員は null", async () => {
    expect(
      await queryService.findMemberLayout("clerk_test_not_exists")
    ).toBeNull();
  });

  it("退会済みの会員は null", async () => {
    expect(
      await queryService.findMemberLayout(CLERK_WITHDRAWN_USER)
    ).toBeNull();
  });
});

describe("SupabaseMemberQueryService.findStripeCustomerId", () => {
  it("会員の Stripe Customer を返す（入会の確定前でも）", async () => {
    expect(await queryService.findStripeCustomerId(CLERK_PENDING_USER)).toBe(
      "cus_test_member_query_pending"
    );
  });

  it("Stripe Customer が未作成の会員は null", async () => {
    expect(await queryService.findStripeCustomerId(CLERK_USER)).toBeNull();
  });

  it("存在しない会員は null", async () => {
    expect(
      await queryService.findStripeCustomerId("clerk_test_not_exists")
    ).toBeNull();
  });

  it("退会済みの会員は null", async () => {
    expect(
      await queryService.findStripeCustomerId(CLERK_WITHDRAWN_USER)
    ).toBeNull();
  });
});

describe("SupabaseMemberQueryService.findMemberRank", () => {
  it("会員のランクを返す", async () => {
    expect((await queryService.findMemberRank(CLERK_USER))?.value).toBe(
      "advanced"
    );
    expect((await queryService.findMemberRank(CLERK_OTHER_USER))?.value).toBe(
      "basic"
    );
  });

  it("存在しない会員は null", async () => {
    expect(
      await queryService.findMemberRank("clerk_test_not_exists")
    ).toBeNull();
  });

  it("退会済みの会員は null", async () => {
    expect(await queryService.findMemberRank(CLERK_WITHDRAWN_USER)).toBeNull();
  });
});

describe("SupabaseMemberQueryService.findOnboardingCompleted", () => {
  it("入会が確定した会員は true", async () => {
    expect(await queryService.findOnboardingCompleted(CLERK_USER)).toBe(true);
  });

  it("入会の確定がまだの会員は false", async () => {
    expect(await queryService.findOnboardingCompleted(CLERK_PENDING_USER)).toBe(
      false
    );
  });

  it("存在しない会員は false", async () => {
    expect(
      await queryService.findOnboardingCompleted("clerk_test_not_exists")
    ).toBe(false);
  });

  it("退会済みの会員は false", async () => {
    expect(
      await queryService.findOnboardingCompleted(CLERK_WITHDRAWN_USER)
    ).toBe(false);
  });
});

// page・layout・Server Action が使う組み立て。ログイン中の会員のトークンで RLS を効かせたクライアントでも取得できること
describe("memberQueryService（composition。RLS 付きのクライアント）", () => {
  it("ログイン中の会員の設定・お気に入り・レイアウト・入会の確定・ランクを取得できる", async () => {
    getToken.mockResolvedValue(signTestJwt(CLERK_USER));
    const rlsQueryService = await memberQueryService();

    expect(
      (await rlsQueryService.findSettings(CLERK_USER))?.addresses
    ).toHaveLength(3);
    expect(
      (await rlsQueryService.findFavorites(CLERK_USER))?.favoriteProductIds
    ).toEqual(["prod-new", "prod-old"]);
    expect(await rlsQueryService.findMemberLayout(CLERK_USER)).toEqual({
      confirmedAmount: 3_200_000,
      monthlyLimit: 50_000_000,
      favoriteProductIds: ["prod-new", "prod-old"],
    });
    expect(await rlsQueryService.findOnboardingCompleted(CLERK_USER)).toBe(
      true
    );
    expect((await rlsQueryService.findMemberRank(CLERK_USER))?.value).toBe(
      "advanced"
    );
  });

  it("入会の確定がまだの会員のトークンでも、自分の入会状態を取得できる", async () => {
    getToken.mockResolvedValue(signTestJwt(CLERK_PENDING_USER));
    const rlsQueryService = await memberQueryService();

    expect(
      await rlsQueryService.findOnboardingCompleted(CLERK_PENDING_USER)
    ).toBe(false);
    expect(await rlsQueryService.findStripeCustomerId(CLERK_PENDING_USER)).toBe(
      "cus_test_member_query_pending"
    );
  });

  it("引数に他の会員を渡しても、RLS によりトークンの会員以外のデータは取得できない", async () => {
    getToken.mockResolvedValue(signTestJwt(CLERK_OTHER_USER));
    const rlsQueryService = await memberQueryService();

    expect(await rlsQueryService.findSettings(CLERK_USER)).toBeNull();
    expect(await rlsQueryService.findFavorites(CLERK_USER)).toBeNull();
    expect(await rlsQueryService.findMemberLayout(CLERK_USER)).toBeNull();
    expect(await rlsQueryService.findOnboardingCompleted(CLERK_USER)).toBe(
      false
    );
    expect(
      await rlsQueryService.findStripeCustomerId(CLERK_PENDING_USER)
    ).toBeNull();
    expect(await rlsQueryService.findMemberRank(CLERK_USER)).toBeNull();
  });
});
