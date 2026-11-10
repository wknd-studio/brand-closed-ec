import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { Order } from "@/domain/entities/order";
import { OrderItem } from "@/domain/entities/order-item";
import { OrderSettlement } from "@/domain/entities/order-settlement";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

// ローカル開発用Supabase CLIが固定で発行するJWTシークレット（`supabase start`の出力に
// 常に表示される既知の定数であり、プロジェクト固有の秘密情報ではない）。
const LOCAL_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function signTestJwt(claims: Record<string, unknown>): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
    ...claims,
  };
  const headerPart = base64url(JSON.stringify(header));
  const payloadPart = base64url(JSON.stringify(payload));
  const signature = createHmac("sha256", LOCAL_JWT_SECRET)
    .update(`${headerPart}.${payloadPart}`)
    .digest();
  return `${headerPart}.${payloadPart}.${base64url(signature)}`;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabase = createClient<Database>(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// 会員のセッションと同じく、会員のトークンで呼ぶクライアント
function clientAs(clerkUserId: string) {
  return createClient<Database>(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: { persistSession: false },
      global: {
        headers: {
          Authorization: `Bearer ${signTestJwt({ sub: clerkUserId })}`,
        },
      },
    }
  );
}

// 指定したテーブルへのリクエストにだけ PostgREST のエラーを返すクライアント。
// 実DBでは SELECT を失敗させにくいため、ネットワーク層で失敗を差し込む
function clientFailingOn(table: string) {
  return createClient<Database>(
    supabaseUrl,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: { persistSession: false },
      global: {
        fetch: async (input, init) => {
          const url = new URL(input instanceof Request ? input.url : input);
          if (url.pathname === `/rest/v1/${table}`) {
            return new Response(
              JSON.stringify({
                code: "XX000",
                message: "injected failure",
                details: null,
                hint: null,
              }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }
          return fetch(input, init);
        },
      },
    }
  );
}

const TEST_USER_ID = "00000000-0000-0000-0000-000000000020";
const OTHER_USER_ID = "00000000-0000-0000-0000-000000000021";
// users に存在しない会員ID（注文が無い会員として使う）
const NO_ORDER_USER_ID = "00000000-0000-0000-0000-000000000029";
const ORDER_ID = "00000000-0000-0000-0000-000000000001";
const ORDER_ID_2 = "00000000-0000-0000-0000-000000000002";
const ORDER_ID_3 = "00000000-0000-0000-0000-000000000003";
const CANCELLED_ORDER_ID = "00000000-0000-0000-0000-000000000004";
const ORDER_INVOICE_SENT_ID = "00000000-0000-0000-0000-000000000005";
const ORDER_LIMIT_EXCEEDED_ID = "00000000-0000-0000-0000-000000000006";
const OTHER_USER_ORDER_ID = "00000000-0000-0000-0000-000000000007";
const DELETE_FAIL_ORDER_ID = "00000000-0000-0000-0000-000000000008";
// DELETE_FAIL_ORDER_ID の決済単位を参照する明細を持つ、別の注文
const BLOCKER_ORDER_ID = "00000000-0000-0000-0000-000000000009";
const SETTLEMENT_ID = "00000000-0000-0000-0000-0000000000a1";
const SETTLEMENT_ID_3 = "00000000-0000-0000-0000-0000000000a3";
const CANCELLED_ORDER_SETTLEMENT_ID = "00000000-0000-0000-0000-0000000000a4";
const SETTLEMENT_ID_5 = "00000000-0000-0000-0000-0000000000a5";
const SETTLEMENT_ID_6 = "00000000-0000-0000-0000-0000000000a6";
const DELETE_FAIL_SETTLEMENT_ID = "00000000-0000-0000-0000-0000000000a8";
const DELETE_FAIL_ITEM_ID = "00000000-0000-0000-0000-000000000038";
const BLOCKER_ITEM_ID = "00000000-0000-0000-0000-000000000039";
const STRIPE_SESSION_ID = "cs_test_infra_001";
const STRIPE_INVOICE_ID = "in_test_infra_001";

const ALL_ORDER_IDS = [
  ORDER_ID,
  ORDER_ID_2,
  ORDER_ID_3,
  CANCELLED_ORDER_ID,
  ORDER_INVOICE_SENT_ID,
  ORDER_LIMIT_EXCEEDED_ID,
  OTHER_USER_ORDER_ID,
  DELETE_FAIL_ORDER_ID,
  BLOCKER_ORDER_ID,
];

const snapshotProps = {
  recipientLastName: "テスト",
  recipientFirstName: "太郎",
  postalCode: "100-0001",
  prefecture: "東京都",
  city: "千代田区",
  addressLine1: "丸の内1-1-1",
  addressLine2: "",
  phoneNumber: "03-1234-5678",
};

function makeItem(
  id: string,
  overrides: Partial<Parameters<typeof OrderItem.of>[0]> = {}
) {
  return OrderItem.of({
    id,
    sanityProductId: "prod-001",
    productNameSnapshot: "テスト商品",
    unitPriceSnapshot: Money.of(50_000),
    quantity: 2,
    isNegotiable: false,
    negotiatedUnitPrice: null,
    paymentTiming: "at_order",
    settlementId: null,
    ...overrides,
  });
}

function makeSettlement(
  overrides: Partial<Parameters<typeof OrderSettlement.of>[0]> = {}
) {
  return OrderSettlement.of({
    id: SETTLEMENT_ID,
    orderId: ORDER_ID,
    flow: "checkout",
    status: "pending_payment",
    stripeCheckoutSessionId: STRIPE_SESSION_ID,
    stripeInvoiceId: null,
    amount: Money.of(100_000),
    paidAt: null,
    cancelledAt: null,
    ...overrides,
  });
}

function makeOrder(overrides: Partial<Parameters<typeof Order.of>[0]> = {}) {
  return Order.of({
    id: ORDER_ID,
    userId: TEST_USER_ID,
    status: OrderStatus.of("processing"),
    shippingAddress: AddressSnapshot.of(snapshotProps),
    billingAddress: AddressSnapshot.of(snapshotProps),
    rankAtOrder: MemberRank.of("basic"),
    monthlyLimitAtOrder: Money.of(1_000_000),
    items: [
      makeItem("00000000-0000-0000-0000-000000000031", {
        settlementId: SETTLEMENT_ID,
      }),
    ],
    settlements: [makeSettlement()],
    createdAt: new Date(2026, 5, 12),
    ...overrides,
  });
}

async function cleanup() {
  await supabase.from("order_items").delete().in("order_id", ALL_ORDER_IDS);
  await supabase
    .from("order_settlements")
    .delete()
    .in("order_id", ALL_ORDER_IDS);
  await supabase.from("orders").delete().in("id", ALL_ORDER_IDS);
}

beforeAll(async () => {
  await cleanup();
  for (const [id, clerkId] of [
    [TEST_USER_ID, "clerk_test_order_infra"],
    [OTHER_USER_ID, "clerk_test_order_infra_other"],
  ]) {
    await supabase.from("users").delete().eq("id", id);
    const { error } = await supabase.from("users").insert({
      id,
      clerk_user_id: clerkId,
      email: `${clerkId}@example.com`,
      first_name: "テスト",
      last_name: "太郎",
      rank_code: "basic",
      onboarding_completed: true,
      billing_anchor_day: 10,
    });
    if (error) throw error;
  }
});

afterAll(async () => {
  await cleanup();
  await supabase.from("users").delete().in("id", [TEST_USER_ID, OTHER_USER_ID]);
});

describe("SupabaseOrderRepository", () => {
  const repo = new SupabaseOrderRepository(supabase);

  describe("save() — 新規作成", () => {
    it("Order・OrderItem・OrderSettlementを保存し、明細を決済単位に紐付けられる", async () => {
      await repo.save(makeOrder());

      const { data: order } = await supabase
        .from("orders")
        .select("id, status")
        .eq("id", ORDER_ID)
        .single();
      expect(order?.status).toBe("processing");

      const { data: settlement } = await supabase
        .from("order_settlements")
        .select("flow, status, amount_snapshot, stripe_checkout_session_id")
        .eq("id", SETTLEMENT_ID)
        .single();
      expect(settlement).toEqual({
        flow: "checkout",
        status: "pending_payment",
        amount_snapshot: 100_000,
        stripe_checkout_session_id: STRIPE_SESSION_ID,
      });

      const { data: item } = await supabase
        .from("order_items")
        .select("payment_timing, settlement_id")
        .eq("order_id", ORDER_ID)
        .single();
      expect(item).toEqual({
        payment_timing: "at_order",
        settlement_id: SETTLEMENT_ID,
      });
    });

    it("決済単位を持たないafter_order明細（settlement_id=NULL）も保存できる", async () => {
      await repo.save(
        makeOrder({
          id: ORDER_ID_2,
          items: [
            makeItem("00000000-0000-0000-0000-000000000032", {
              paymentTiming: "after_order",
              settlementId: null,
            }),
          ],
          settlements: [],
        })
      );

      const reloaded = await repo.findById(ORDER_ID_2);
      expect(reloaded!.settlements).toEqual([]);
      expect(reloaded!.items[0]?.paymentTiming).toBe("after_order");
      expect(reloaded!.items[0]?.settlementId).toBeNull();
    });
  });

  describe("findById()", () => {
    it("保存済みのOrderを、明細と決済単位込みで返す", async () => {
      const order = await repo.findById(ORDER_ID);
      expect(order).not.toBeNull();
      expect(order!.status.value).toBe("processing");
      expect(order!.items).toHaveLength(1);
      expect(order!.items[0]?.unitPriceSnapshot.amount).toBe(50_000);
      expect(order!.items[0]?.settlementId).toBe(SETTLEMENT_ID);
      expect(order!.settlements).toHaveLength(1);
      expect(order!.settlements[0]?.amount.amount).toBe(100_000);
      expect(order!.settlements[0]?.flow).toBe("checkout");
    });

    it("存在しないIDはnullを返す", async () => {
      expect(
        await repo.findById("00000000-0000-0000-0000-000000000000")
      ).toBeNull();
    });
  });

  describe("findByStripeCheckoutSessionId()", () => {
    it("決済単位のセッションIDで注文を検索できる", async () => {
      const order = await repo.findByStripeCheckoutSessionId(STRIPE_SESSION_ID);
      expect(order!.id).toBe(ORDER_ID);
      expect(order!.settlements[0]?.id).toBe(SETTLEMENT_ID);
    });

    it("存在しないセッションIDはnullを返す", async () => {
      expect(await repo.findByStripeCheckoutSessionId("cs_nonexistent")).toBe(
        null
      );
    });
  });

  describe("findByStripeInvoiceId()", () => {
    it("invoice決済単位のInvoice IDで注文を検索できる", async () => {
      await repo.save(
        makeOrder({
          id: ORDER_ID_3,
          items: [
            makeItem("00000000-0000-0000-0000-000000000033", {
              paymentTiming: "after_order",
              settlementId: SETTLEMENT_ID_3,
            }),
          ],
          settlements: [
            makeSettlement({
              id: SETTLEMENT_ID_3,
              orderId: ORDER_ID_3,
              flow: "invoice",
              status: "invoice_sent",
              stripeCheckoutSessionId: null,
              stripeInvoiceId: STRIPE_INVOICE_ID,
            }),
          ],
        })
      );

      const order = await repo.findByStripeInvoiceId(STRIPE_INVOICE_ID);
      expect(order!.id).toBe(ORDER_ID_3);
      expect(order!.settlements[0]?.status).toBe("invoice_sent");
    });

    it("存在しないInvoice IDはnullを返す", async () => {
      expect(await repo.findByStripeInvoiceId("in_nonexistent")).toBeNull();
    });
  });

  describe("save() — 更新", () => {
    it("決済単位をpaidにしてロールアップしたstatusを保存できる", async () => {
      const order = await repo.findById(ORDER_ID);
      const paidAt = new Date(2026, 5, 13);
      await repo.save(
        order!.applySettlement(order!.settlements[0]!.markPaid(paidAt))
      );

      const reloaded = await repo.findById(ORDER_ID);
      expect(reloaded!.status.value).toBe("paid");
      expect(reloaded!.settlements[0]?.status).toBe("paid");
      expect(reloaded!.settlements[0]?.paidAt?.toISOString()).toBe(
        paidAt.toISOString()
      );
    });
  });

  // docs/domain/settlement.md「今月すでに確定している金額」は明細単位で算出する
  describe("sumConfirmedAmountByUserId()", () => {
    const period = MonthlyPeriod.fromSubscribedAt(
      new Date(2026, 0, 10),
      new Date(2026, 5, 15)
    );

    it("キャンセルされていない注文の明細を合計する（決済済み100,000 + 決済単位未作成のafter_order 100,000）", async () => {
      const total = await repo.sumConfirmedAmountByUserId(TEST_USER_ID, period);
      // ORDER_ID: paid決済単位の明細 50,000×2 / ORDER_ID_2: settlement_id=NULLのafter_order 50,000×2
      // ORDER_ID_3: invoice_sent決済単位の明細 50,000×2
      expect(total).toBe(300_000);
    });

    it("cancelledの決済単位に属する明細は含めない", async () => {
      const order = await repo.findById(ORDER_ID_3);
      await repo.save(
        order!.applySettlement(order!.settlements[0]!.cancel(new Date()))
      );

      const total = await repo.sumConfirmedAmountByUserId(TEST_USER_ID, period);
      expect(total).toBe(200_000);
    });

    it("cancelledの注文の明細は含めない", async () => {
      await repo.save(
        makeOrder({
          id: CANCELLED_ORDER_ID,
          status: OrderStatus.of("cancelled"),
          items: [
            makeItem("00000000-0000-0000-0000-000000000034", {
              settlementId: CANCELLED_ORDER_SETTLEMENT_ID,
            }),
          ],
          settlements: [
            makeSettlement({
              id: CANCELLED_ORDER_SETTLEMENT_ID,
              orderId: CANCELLED_ORDER_ID,
              stripeCheckoutSessionId: null,
            }),
          ],
        })
      );

      const total = await repo.sumConfirmedAmountByUserId(TEST_USER_ID, period);
      expect(total).toBe(200_000);
    });

    it("他ユーザーの注文は含めない", async () => {
      expect(await repo.sumConfirmedAmountByUserId(OTHER_USER_ID, period)).toBe(
        0
      );
    });

    it("注文が無い会員は 0 を返す", async () => {
      expect(
        await repo.sumConfirmedAmountByUserId(NO_ORDER_USER_ID, period)
      ).toBe(0);
    });

    // 失敗を「注文0件」と同じ扱いにすると、確定額が実際より少なく返り、
    // 月次上限の事前チェックやカートの残額表示を誤らせる（#597）
    it.each(["orders", "order_items"])(
      "%s の SELECT がエラーを返したときは 0 を返さず例外を投げる",
      async (table) => {
        const failingRepo = new SupabaseOrderRepository(clientFailingOn(table));
        await expect(
          failingRepo.sumConfirmedAmountByUserId(TEST_USER_ID, period)
        ).rejects.toThrow("確定額の集計に失敗");
      }
    );
  });

  describe("findByIdWithUser()", () => {
    it("ユーザー情報・明細・決済単位を返す", async () => {
      const order = await repo.findByIdWithUser(ORDER_ID);
      expect(order!.user?.email).toBe("clerk_test_order_infra@example.com");
      expect(order!.status).toBe("paid");
      expect(order!.items[0]).toMatchObject({
        paymentTiming: "at_order",
        settlementId: SETTLEMENT_ID,
      });
      expect(order!.settlements).toEqual([
        expect.objectContaining({
          id: SETTLEMENT_ID,
          flow: "checkout",
          status: "paid",
          amount: 100_000,
        }),
      ]);
    });
  });

  // 退会の判定用（#587）。どの注文が退会を止めるかは User.withdraw() が判定するため、
  // repository は会員の注文を状態で絞らずにすべて返す
  describe("findByUserId()", () => {
    it("会員の注文を状態に関わらずすべて返し、他の会員の注文は含まない", async () => {
      await repo.save(
        makeOrder({
          id: ORDER_INVOICE_SENT_ID,
          items: [
            makeItem("00000000-0000-0000-0000-000000000035", {
              paymentTiming: "after_order",
              settlementId: SETTLEMENT_ID_5,
            }),
          ],
          settlements: [
            makeSettlement({
              id: SETTLEMENT_ID_5,
              orderId: ORDER_INVOICE_SENT_ID,
              flow: "invoice",
              status: "invoice_sent",
              stripeCheckoutSessionId: null,
              stripeInvoiceId: "in_test_active_005",
            }),
          ],
        })
      );
      await repo.save(
        makeOrder({
          id: ORDER_LIMIT_EXCEEDED_ID,
          items: [
            makeItem("00000000-0000-0000-0000-000000000036", {
              paymentTiming: "after_order",
              settlementId: SETTLEMENT_ID_6,
            }),
          ],
          settlements: [
            makeSettlement({
              id: SETTLEMENT_ID_6,
              orderId: ORDER_LIMIT_EXCEEDED_ID,
              flow: "invoice",
              status: "limit_exceeded",
              stripeCheckoutSessionId: null,
            }),
          ],
        })
      );

      await repo.save(
        makeOrder({
          id: OTHER_USER_ORDER_ID,
          userId: OTHER_USER_ID,
          items: [
            makeItem("00000000-0000-0000-0000-000000000037", {
              paymentTiming: "after_order",
            }),
          ],
          settlements: [],
        })
      );

      const orders = await repo.findByUserId(TEST_USER_ID);
      const ids = orders.map((o) => o.id).sort();

      // 支払い済み・後払い未請求・決済単位キャンセル済み・注文キャンセル済み・
      // 請求済み未払い・上限超過の注文をすべて含む
      expect(ids).toEqual(
        [
          ORDER_ID,
          ORDER_ID_2,
          ORDER_ID_3,
          CANCELLED_ORDER_ID,
          ORDER_INVOICE_SENT_ID,
          ORDER_LIMIT_EXCEEDED_ID,
        ].sort()
      );
      expect(orders.every((o) => o.userId === TEST_USER_ID)).toBe(true);
    });

    it("注文が無い会員は空配列", async () => {
      expect(await repo.findByUserId(NO_ORDER_USER_ID)).toEqual([]);
    });
  });

  describe("delete()", () => {
    it("Order・明細・決済単位をまとめて削除する", async () => {
      await repo.delete(ORDER_ID_3);

      expect(await repo.findById(ORDER_ID_3)).toBeNull();
      const { data: settlements } = await supabase
        .from("order_settlements")
        .select("id")
        .eq("order_id", ORDER_ID_3);
      expect(settlements).toEqual([]);
      const { data: items } = await supabase
        .from("order_items")
        .select("id")
        .eq("order_id", ORDER_ID_3);
      expect(items).toEqual([]);
    });

    describe("途中で失敗したとき", () => {
      beforeAll(async () => {
        await repo.save(
          makeOrder({
            id: DELETE_FAIL_ORDER_ID,
            items: [
              makeItem(DELETE_FAIL_ITEM_ID, {
                settlementId: DELETE_FAIL_SETTLEMENT_ID,
              }),
            ],
            settlements: [
              makeSettlement({
                id: DELETE_FAIL_SETTLEMENT_ID,
                orderId: DELETE_FAIL_ORDER_ID,
                stripeCheckoutSessionId: "cs_test_infra_delete_fail",
              }),
            ],
          })
        );
        // 別の注文の明細が DELETE_FAIL_ORDER_ID の決済単位を参照しているため、
        // 明細の削除のあと、決済単位の削除が外部キーで失敗する
        const { error: orderError } = await supabase.from("orders").insert({
          id: BLOCKER_ORDER_ID,
          user_id: TEST_USER_ID,
          status: "processing",
          shipping_address_snapshot: snapshotProps,
          billing_address_snapshot: snapshotProps,
          rank_at_order: "basic",
          monthly_limit_at_order: 1_000_000,
        });
        if (orderError) throw orderError;
        const { error: itemError } = await supabase.from("order_items").insert({
          id: BLOCKER_ITEM_ID,
          order_id: BLOCKER_ORDER_ID,
          sanity_product_id: "prod-001",
          product_name_snapshot: "テスト商品",
          unit_price_snapshot: 50_000,
          quantity: 1,
          is_negotiable: false,
          payment_timing: "at_order",
          settlement_id: DELETE_FAIL_SETTLEMENT_ID,
        });
        if (itemError) throw itemError;
      });

      it("例外を投げ、明細・決済単位・注文のどれも消えていない", async () => {
        await expect(repo.delete(DELETE_FAIL_ORDER_ID)).rejects.toThrow();

        const { data: items } = await supabase
          .from("order_items")
          .select("id")
          .eq("order_id", DELETE_FAIL_ORDER_ID);
        expect(items).toEqual([{ id: DELETE_FAIL_ITEM_ID }]);
        const { data: settlements } = await supabase
          .from("order_settlements")
          .select("id")
          .eq("order_id", DELETE_FAIL_ORDER_ID);
        expect(settlements).toEqual([{ id: DELETE_FAIL_SETTLEMENT_ID }]);
        expect(await repo.findById(DELETE_FAIL_ORDER_ID)).not.toBeNull();
      });
    });

    it("会員のトークンからは呼べず、例外を投げて何も消さない", async () => {
      const memberRepo = new SupabaseOrderRepository(
        clientAs("clerk_test_order_infra")
      );

      await expect(memberRepo.delete(ORDER_ID)).rejects.toThrow(
        /permission denied for function delete_order/
      );

      expect(await repo.findById(ORDER_ID)).not.toBeNull();
    });
  });

  // supabase-js は失敗しても例外を投げず error を返すため、捨てると「見つからない」「0件」に化ける（#614）
  describe("DBエラー", () => {
    it.each([
      [
        "findById",
        "orders",
        (r: SupabaseOrderRepository) => r.findById(ORDER_ID),
      ],
      [
        "findByStripeCheckoutSessionId",
        "order_settlements",
        (r: SupabaseOrderRepository) =>
          r.findByStripeCheckoutSessionId(STRIPE_SESSION_ID),
      ],
      [
        "findByStripeInvoiceId",
        "order_settlements",
        (r: SupabaseOrderRepository) =>
          r.findByStripeInvoiceId(STRIPE_INVOICE_ID),
      ],
      [
        "findActiveOrdersWithUser",
        "orders",
        (r: SupabaseOrderRepository) => r.findActiveOrdersWithUser(),
      ],
      [
        "findByIdWithUser",
        "orders",
        (r: SupabaseOrderRepository) => r.findByIdWithUser(ORDER_ID),
      ],
    ] as const)("%s は読み取りの失敗で例外を投げる", async (_, table, call) => {
      await expect(
        call(new SupabaseOrderRepository(clientFailingOn(table)))
      ).rejects.toThrow("injected failure");
    });

    it("findById・findByIdWithUser は不正なUUIDで例外を投げる", async () => {
      await expect(repo.findById("not-a-uuid")).rejects.toThrow();
      await expect(repo.findByIdWithUser("not-a-uuid")).rejects.toThrow();
    });

    it("findByIdWithUser は存在しないIDでnullを返す", async () => {
      expect(
        await repo.findByIdWithUser("00000000-0000-0000-0000-0000000006f0")
      ).toBeNull();
    });

    it("save は制約違反（存在しない会員）で例外を投げる", async () => {
      await expect(
        repo.save(
          makeOrder({
            id: "00000000-0000-0000-0000-0000000006f1",
            userId: NO_ORDER_USER_ID,
          })
        )
      ).rejects.toThrow("Order保存に失敗");
    });
  });
});
