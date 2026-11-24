import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { type Order, reconstituteOrder } from "@/domain/entities/order";
import {
  reconstituteOrderItem,
  type PaymentTiming,
} from "@/domain/entities/order-item";
import { reconstituteOrderSettlement } from "@/domain/entities/order-settlement";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MonthlyLimit } from "@/domain/value-objects/monthly-limit";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";
import { OrderConcurrentlyModifiedError } from "@/domain/errors/order-concurrently-modified-error";

// save_order の楽観ロック（issue #721）。呼び出し側はロックを取らずに findById で読んだ注文を
// 書き戻すため、読んでから書き戻すまでの間に別の書き手（請求作成・Webhook・運営者のキャンセル等）が
// コミットしていれば、save_order は失敗して何も書き換えない

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID = "00000000-0000-0000-0000-0000007210a1";
const CLERK_ID = "clerk_test_save_order_optimistic_lock";
const ADMIN_USER_ID = "00000000-0000-0000-0000-0000007210f1";

const ORDERED_AT = new Date(2026, 5, 12);
const PERIOD = MonthlyPeriod.fromBillingAnchorDay(10, new Date(2026, 5, 15));

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

let seq = 0;
function newId(): string {
  seq += 1;
  return `00000000-0000-0000-0000-721${String(seq).padStart(9, "0")}`;
}

/**
 * 未保存の注文を組み立てる。at_order の明細には Checkout の決済単位（pending_payment）を付け、
 * after_order の明細は未請求（settlement_id = NULL）のままにする
 */
function buildOrder(timings: PaymentTiming[]): Order {
  const orderId = newId();
  const checkoutId = newId();
  const hasAtOrder = timings.includes("at_order");
  return reconstituteOrder({
    id: orderId,
    userId: USER_ID,
    status: OrderStatus.of("processing"),
    shippingAddress: AddressSnapshot.of(snapshotProps),
    billingAddress: AddressSnapshot.of(snapshotProps),
    rankAtOrder: MemberRank.of("starter"),
    monthlyLimitAtOrder: MonthlyLimit.of(300_000),
    items: timings.map((timing) =>
      reconstituteOrderItem({
        id: newId(),
        sanityProductId: "prod-721",
        productNameSnapshot: "楽観ロックテスト商品",
        unitPriceSnapshot: Money.of(10_000),
        quantity: 1,
        isNegotiable: false,
        negotiatedUnitPrice: null,
        paymentTiming: timing,
        settlementId: timing === "at_order" ? checkoutId : null,
      })
    ),
    settlements: hasAtOrder
      ? [
          reconstituteOrderSettlement({
            id: checkoutId,
            orderId,
            flow: "checkout",
            status: "pending_payment",
            stripeCheckoutSessionId: null,
            stripeInvoiceId: null,
            amount: Money.of(
              10_000 * timings.filter((t) => t === "at_order").length
            ),
            paidAt: null,
            cancelledAt: null,
          }),
        ]
      : [],
    createdAt: ORDERED_AT,
  });
}

async function seedOrder(timings: PaymentTiming[]): Promise<Order> {
  const order = buildOrder(timings);
  await repo.save(order, { type: "system" });
  return order;
}

async function read(orderId: string): Promise<Order> {
  const order = await repo.findById(orderId);
  if (!order) throw new Error("注文が見つかりません");
  return order;
}

async function cleanup() {
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", USER_ID);
  const orderIds = orders?.map((o) => o.id) ?? [];
  if (orderIds.length > 0) {
    await supabase.from("order_items").delete().in("order_id", orderIds);
    await supabase.from("order_settlements").delete().in("order_id", orderIds);
    await supabase.from("orders").delete().in("id", orderIds);
  }
}

const repo = new SupabaseOrderRepository(supabase);

beforeAll(async () => {
  await cleanup();
  await supabase.from("users").delete().eq("id", USER_ID);
  await supabase.from("admin_users").delete().eq("id", ADMIN_USER_ID);
  const { error: userError } = await supabase.from("users").insert({
    id: USER_ID,
    clerk_user_id: CLERK_ID,
    email: "save-order-optimistic-lock-test@example.com",
    first_name: "テスト",
    last_name: "太郎",
    rank_code: "starter",
    onboarding_completed: true,
    billing_anchor_day: 10,
  });
  if (userError) throw userError;
  const { error: adminError } = await supabase.from("admin_users").insert({
    id: ADMIN_USER_ID,
    clerk_user_id: "clerk_test_save_order_optimistic_lock_admin",
    name: "運営 太郎",
    email: "save-order-optimistic-lock-admin@example.com",
  });
  if (adminError) throw adminError;
});

beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await supabase.from("users").delete().eq("id", USER_ID);
  await supabase.from("admin_users").delete().eq("id", ADMIN_USER_ID);
});

const adminCancel = {
  type: "admin",
  adminUserId: ADMIN_USER_ID,
  reason: null,
} as const;

describe("save_order の楽観ロック", () => {
  it("キャンセルが読んだ後に請求作成がコミットすると、キャンセルの保存は失敗し、請求作成の結果が残る", async () => {
    const seeded = await seedOrder(["after_order", "after_order"]);
    const itemIds = seeded.items.map((i) => i.id);

    // 1. キャンセルが注文を読む（明細は未請求、invoice の決済単位はまだ無い）
    const readByCancel = await read(seeded.id);
    // 2. 請求作成がコミットする
    const invoiceId = newId();
    await repo.createInvoiceSettlementWithLimitCheck({
      draft: (await read(seeded.id)).draftInvoiceSettlement({
        settlementId: invoiceId,
        itemIds,
      }),
      period: PERIOD,
      monthlyLimit: MonthlyLimit.of(300_000),
      adminUserId: ADMIN_USER_ID,
    });
    // 3. キャンセルの保存は失敗する
    await expect(
      repo.save(readByCancel.cancel(new Date()), adminCancel)
    ).rejects.toBeInstanceOf(OrderConcurrentlyModifiedError);

    const after = await read(seeded.id);
    expect(after.status.value).toBe("processing");
    expect(after.items.map((i) => i.settlementId)).toEqual([
      invoiceId,
      invoiceId,
    ]);
    expect(after.settlements).toHaveLength(1);
    expect(after.settlements[0]?.status).toBe("invoice_sent");

    const { data: history, error } = await supabase
      .from("order_status_changes")
      .select("to_status")
      .eq("order_id", seeded.id);
    if (error) throw error;
    expect(history.map((h) => h.to_status)).not.toContain("cancelled");
  });

  it("同じ注文を読んだ2つの書き手のうち、後から保存した方は失敗し、先の保存が残る", async () => {
    const seeded = await seedOrder(["at_order"]);
    const readByWebhook = await read(seeded.id);
    const readByAdmin = await read(seeded.id);

    const checkout = readByWebhook.checkoutSettlement()!;
    await repo.save(
      readByWebhook.applySettlement(checkout.markPaid(new Date())),
      {
        type: "system",
      }
    );
    await expect(
      repo.save(readByAdmin.cancel(new Date()), adminCancel)
    ).rejects.toBeInstanceOf(OrderConcurrentlyModifiedError);

    const after = await read(seeded.id);
    expect(after.status.value).toBe("paid");
    expect(after.settlements[0]?.status).toBe("paid");
  });

  it("失敗した後に読み直せば、保存できる", async () => {
    const seeded = await seedOrder(["at_order"]);
    const stale = await read(seeded.id);
    await repo.save((await read(seeded.id)).cancel(new Date()), adminCancel);
    await expect(
      repo.save(stale.cancel(new Date()), adminCancel)
    ).rejects.toBeInstanceOf(OrderConcurrentlyModifiedError);

    const reread = await read(seeded.id);
    expect(reread.status.value).toBe("cancelled");
    // 読み直した注文は版が新しいため、書き換えが無ければそのまま保存できる
    await expect(repo.save(reread, adminCancel)).resolves.toBeUndefined();
  });

  it("保存のたびに版が進み、読み直した注文は続けて保存できる", async () => {
    const seeded = await seedOrder(["at_order"]);
    const first = await read(seeded.id);
    await repo.save(first, { type: "system" });
    const second = await read(seeded.id);
    expect(second.version).toBe(first.version + 1);
    await repo.save(second.cancel(new Date()), adminCancel);
    expect((await read(seeded.id)).version).toBe(second.version + 1);
  });

  it("注文確定（place_order_with_limit_check）で作った注文は、読み直さずに Checkout Session を紐付けて保存できる", async () => {
    // place-order は確定直後の注文をそのまま save する（Checkout Session の紐付け）
    const order = buildOrder(["at_order"]);
    await repo.saveNewOrderWithLimitCheck(
      order,
      PERIOD,
      MonthlyLimit.of(300_000),
      order.getFixedTotal()
    );
    const checkout = order.checkoutSettlement()!;
    await repo.save(
      order.applySettlement(
        checkout.attachCheckoutSession("cs_test_721_attach")
      ),
      { type: "customer" }
    );

    const after = await read(order.id);
    expect(after.checkoutSettlement()?.stripeCheckoutSessionId).toBe(
      "cs_test_721_attach"
    );
  });

  it("請求作成も版を進める（請求作成の前に読んだ注文は保存できない）", async () => {
    const seeded = await seedOrder(["after_order"]);
    const before = await read(seeded.id);
    await repo.createInvoiceSettlementWithLimitCheck({
      draft: before.draftInvoiceSettlement({
        settlementId: newId(),
        itemIds: [seeded.items[0]!.id],
      }),
      period: PERIOD,
      monthlyLimit: MonthlyLimit.of(300_000),
      adminUserId: ADMIN_USER_ID,
    });
    expect((await read(seeded.id)).version).toBe(before.version + 1);
  });

  it("請求作成の後に読んだ注文は保存できる", async () => {
    const seeded = await seedOrder(["after_order"]);
    const invoiceId = newId();
    await repo.createInvoiceSettlementWithLimitCheck({
      draft: (await read(seeded.id)).draftInvoiceSettlement({
        settlementId: invoiceId,
        itemIds: [seeded.items[0]!.id],
      }),
      period: PERIOD,
      monthlyLimit: MonthlyLimit.of(300_000),
      adminUserId: ADMIN_USER_ID,
    });

    const after = await read(seeded.id);
    await repo.save(after.cancel(new Date()), adminCancel);

    const cancelled = await read(seeded.id);
    expect(cancelled.status.value).toBe("cancelled");
    expect(cancelled.settlements.find((s) => s.id === invoiceId)?.status).toBe(
      "cancelled"
    );
  });
});
