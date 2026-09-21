import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
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

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000020";
const OTHER_USER_ID = "00000000-0000-0000-0000-000000000021";
const ORDER_ID = "00000000-0000-0000-0000-000000000001";
const ORDER_ID_2 = "00000000-0000-0000-0000-000000000002";
const ORDER_ID_3 = "00000000-0000-0000-0000-000000000003";
const CANCELLED_ORDER_ID = "00000000-0000-0000-0000-000000000004";
const SETTLEMENT_ID = "00000000-0000-0000-0000-0000000000a1";
const SETTLEMENT_ID_3 = "00000000-0000-0000-0000-0000000000a3";
const CANCELLED_ORDER_SETTLEMENT_ID = "00000000-0000-0000-0000-0000000000a4";
const STRIPE_SESSION_ID = "cs_test_infra_001";
const STRIPE_INVOICE_ID = "in_test_infra_001";

const ALL_ORDER_IDS = [ORDER_ID, ORDER_ID_2, ORDER_ID_3, CANCELLED_ORDER_ID];

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

  describe("findActiveByUserId()", () => {
    it("cancelledの注文は含まない", async () => {
      const orders = await repo.findActiveByUserId(TEST_USER_ID);
      const ids = orders.map((o) => o.id);
      expect(ids).toContain(ORDER_ID);
      expect(ids).toContain(ORDER_ID_2);
      expect(ids).not.toContain(CANCELLED_ORDER_ID);
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
  });
});
