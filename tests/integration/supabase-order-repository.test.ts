import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { Order } from "@/domain/entities/order";
import { OrderItem } from "@/domain/entities/order-item";
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
const TEST_ORDER_ID = "00000000-0000-0000-0000-000000000001";
const TEST_STRIPE_SESSION_ID = "cs_test_infra_001";

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

function makeOrder(overrides: Partial<Parameters<typeof Order.of>[0]> = {}) {
  return Order.of({
    id: TEST_ORDER_ID,
    userId: TEST_USER_ID,
    paymentFlow: "checkout",
    status: OrderStatus.of("pending_payment"),
    shippingAddress: AddressSnapshot.of(snapshotProps),
    billingAddress: AddressSnapshot.of(snapshotProps),
    rankAtOrder: MemberRank.of("entry"),
    monthlyLimitAtOrder: Money.of(1_000_000),
    stripeCheckoutSessionId: TEST_STRIPE_SESSION_ID,
    stripeInvoiceId: null,
    items: [
      OrderItem.of({
        id: "00000000-0000-0000-0000-000000000031",
        sanityProductId: "prod-001",
        productNameSnapshot: "テスト商品",
        unitPriceSnapshot: Money.of(50_000),
        quantity: 2,
        isNegotiable: false,
        negotiatedUnitPrice: null,
      }),
    ],
    createdAt: new Date(2026, 5, 1),
    ...overrides,
  });
}

beforeAll(async () => {
  await supabase.from("users").delete().eq("id", TEST_USER_ID);
  await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: "clerk_test_order_infra",
    email: "order-infra-test@example.com",
    first_name: "テスト",
    last_name: "太郎",
    rank: "entry",
    onboarding_completed: true,
    subscribed_at: "2026-01-10T00:00:00.000Z",
  });
});

afterAll(async () => {
  await supabase.from("order_items").delete().eq("order_id", TEST_ORDER_ID);
  await supabase.from("orders").delete().eq("id", TEST_ORDER_ID);
  await supabase.from("users").delete().eq("id", TEST_USER_ID);
});

describe("SupabaseOrderRepository", () => {
  const repo = new SupabaseOrderRepository(supabase);

  describe("save() — 新規作成", () => {
    it("Order と OrderItem を保存できる", async () => {
      await repo.save(makeOrder());

      const { data } = await supabase
        .from("orders")
        .select("id, status")
        .eq("id", TEST_ORDER_ID)
        .single();
      expect(data?.id).toBe(TEST_ORDER_ID);
      expect(data?.status).toBe("pending_payment");
    });
  });

  describe("findById()", () => {
    it("保存済みの Order を返す", async () => {
      const order = await repo.findById(TEST_ORDER_ID);
      expect(order).not.toBeNull();
      expect(order!.status.value).toBe("pending_payment");
      expect(order!.items).toHaveLength(1);
      expect(order!.items[0].unitPriceSnapshot.amount).toBe(50_000);
    });

    it("存在しない ID は null を返す", async () => {
      const order = await repo.findById("00000000-0000-0000-0000-000000000000");
      expect(order).toBeNull();
    });
  });

  describe("findByStripeCheckoutSessionId()", () => {
    it("セッションIDで注文を検索できる", async () => {
      const order = await repo.findByStripeCheckoutSessionId(
        TEST_STRIPE_SESSION_ID
      );
      expect(order).not.toBeNull();
      expect(order!.id).toBe(TEST_ORDER_ID);
    });

    it("存在しないセッションIDは null を返す", async () => {
      const order = await repo.findByStripeCheckoutSessionId("cs_nonexistent");
      expect(order).toBeNull();
    });
  });

  describe("save() — ステータス更新", () => {
    it("ステータスを paid に更新できる", async () => {
      const order = await repo.findById(TEST_ORDER_ID);
      await repo.save(order!.with({ status: OrderStatus.of("paid") }));

      const reloaded = await repo.findById(TEST_ORDER_ID);
      expect(reloaded!.status.value).toBe("paid");
    });
  });

  describe("sumConfirmedAmountByUserId()", () => {
    it("当月期間内の固定価格合計を返す（100,000円 = 50,000 × 2）", async () => {
      const period = MonthlyPeriod.fromSubscribedAt(
        new Date(2026, 0, 10),
        new Date(2026, 5, 15)
      );
      const total = await repo.sumConfirmedAmountByUserId(TEST_USER_ID, period);
      expect(total).toBe(100_000);
    });

    it("キャンセル注文は合計に含まれない", async () => {
      const period = MonthlyPeriod.fromSubscribedAt(
        null,
        new Date(2026, 5, 15)
      );
      const total = await repo.sumConfirmedAmountByUserId(
        "00000000-0000-0000-0000-000000000000",
        period
      );
      expect(total).toBe(0);
    });
  });
});
