import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { reconstituteOrder } from "@/domain/entities/order";
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
import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";

// 請求作成の月次上限チェックと決済単位の作成（issue #393、docs/domain/settlement.md
// 「月次仕入れ上限チェック」）。上限の判定〜決済単位の作成〜明細の紐付け〜orders.status の
// 更新を、ユーザー行の行ロック込みで1回のDB呼び出し（create_invoice_settlement_with_limit_check）にまとめる

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
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient<Database>(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID = "00000000-0000-0000-0000-0000003930a1";
const CLERK_ID = "clerk_test_create_invoice_settlement";
const ADMIN_USER_ID = "00000000-0000-0000-0000-0000003930f1";

// 注文日はすべて同じ月次の期間（6/10〜7/10）に入れる
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
  return `00000000-0000-0000-0000-393${String(seq).padStart(9, "0")}`;
}

type ItemSpec = { price: number; timing: PaymentTiming };

/**
 * 明細を持つ注文を保存し、注文と明細のIDを返す。at_order の明細には Checkout の決済単位
 * （pending_payment）を付け、after_order の明細は未請求（settlement_id = NULL）のままにする
 */
async function seedOrder(items: ItemSpec[]) {
  const orderId = newId();
  const checkoutId = newId();
  const atOrder = items.filter((i) => i.timing === "at_order");
  const orderItems = items.map((spec) =>
    reconstituteOrderItem({
      id: newId(),
      sanityProductId: "prod-393",
      productNameSnapshot: "請求作成テスト商品",
      unitPriceSnapshot: Money.of(spec.price),
      quantity: 1,
      isNegotiable: false,
      negotiatedUnitPrice: null,
      paymentTiming: spec.timing,
      settlementId: spec.timing === "at_order" ? checkoutId : null,
    })
  );
  const order = reconstituteOrder({
    id: orderId,
    userId: USER_ID,
    status: OrderStatus.of("processing"),
    shippingAddress: AddressSnapshot.of(snapshotProps),
    billingAddress: AddressSnapshot.of(snapshotProps),
    rankAtOrder: MemberRank.of("starter"),
    monthlyLimitAtOrder: MonthlyLimit.of(300_000),
    items: orderItems,
    settlements:
      atOrder.length > 0
        ? [
            reconstituteOrderSettlement({
              id: checkoutId,
              orderId,
              flow: "checkout",
              status: "pending_payment",
              stripeCheckoutSessionId: null,
              stripeInvoiceId: null,
              amount: Money.of(atOrder.reduce((s, i) => s + i.price, 0)),
              paidAt: null,
              cancelledAt: null,
            }),
          ]
        : [],
    createdAt: ORDERED_AT,
  });
  await repo.save(order, { type: "system" });
  return { orderId, itemIds: orderItems.map((i) => i.id) };
}

async function settlementsOf(orderId: string) {
  const { data, error } = await supabase
    .from("order_settlements")
    .select("id, flow, status, amount_snapshot, stripe_invoice_id")
    .eq("order_id", orderId)
    .eq("flow", "invoice");
  if (error) throw error;
  return data;
}

async function settlementIdsOf(itemIds: string[]) {
  const { data, error } = await supabase
    .from("order_items")
    .select("id, settlement_id")
    .in("id", itemIds);
  if (error) throw error;
  return Object.fromEntries(data.map((i) => [i.id, i.settlement_id]));
}

async function statusOf(orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .single();
  if (error) throw error;
  return data.status;
}

async function historyOf(orderId: string) {
  const { data, error } = await supabase
    .from("order_status_changes")
    .select("from_status, to_status, changed_by, changed_by_admin_user_id")
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

function createInvoice(
  orderId: string,
  itemIds: string[],
  monthlyLimit: MonthlyLimit,
  settlementId: string = newId(),
  orderRepo: SupabaseOrderRepository = repo
) {
  return orderRepo.createInvoiceSettlementWithLimitCheck({
    orderId,
    itemIds,
    settlementId,
    period: PERIOD,
    monthlyLimit,
    adminUserId: ADMIN_USER_ID,
  });
}

async function cleanup() {
  const { data: orders } = await supabase
    .from("orders")
    .select("id")
    .eq("user_id", USER_ID);
  const orderIds = orders?.map((o) => o.id) ?? [];
  if (orderIds.length > 0) {
    // 履歴は注文の削除と一緒に消える（ON DELETE CASCADE）
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
    email: "create-invoice-settlement-test@example.com",
    first_name: "テスト",
    last_name: "太郎",
    rank_code: "starter",
    onboarding_completed: true,
    billing_anchor_day: 10,
  });
  if (userError) throw userError;
  const { error: adminError } = await supabase.from("admin_users").insert({
    id: ADMIN_USER_ID,
    clerk_user_id: "clerk_test_create_invoice_settlement_admin",
    name: "運営 太郎",
    email: "create-invoice-settlement-admin@example.com",
  });
  if (adminError) throw adminError;
});

// 確定額は会員の全注文から集計するため、テストごとに注文を消して前のテストの金額を持ち越さない
beforeEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await supabase.from("users").delete().eq("id", USER_ID);
  await supabase.from("admin_users").delete().eq("id", ADMIN_USER_ID);
});

describe("請求作成の月次上限チェックと決済単位の作成", () => {
  it("上限内なら invoice_sent の決済単位が作られ、選んだ明細が紐付く", async () => {
    const { orderId, itemIds } = await seedOrder([
      { price: 50_000, timing: "after_order" },
      { price: 30_000, timing: "after_order" },
      { price: 10_000, timing: "after_order" },
    ]);
    const settlementId = newId();

    const result = await createInvoice(
      orderId,
      [itemIds[0]!, itemIds[1]!],
      MonthlyLimit.of(300_000),
      settlementId
    );

    expect(result).toBe("invoice_sent");
    expect(await settlementsOf(orderId)).toEqual([
      {
        id: settlementId,
        flow: "invoice",
        status: "invoice_sent",
        amount_snapshot: 80_000,
        // Stripe Invoice は呼び出し側がこの後に発行して紐付ける
        stripe_invoice_id: null,
      },
    ]);
    // 選ばなかった明細は未請求のまま
    expect(await settlementIdsOf(itemIds)).toEqual({
      [itemIds[0]!]: settlementId,
      [itemIds[1]!]: settlementId,
      [itemIds[2]!]: null,
    });
    // 未払いの決済単位が増えるだけなので、orders.status は変わらず履歴も増えない
    expect(await statusOf(orderId)).toBe("processing");
    expect(await historyOf(orderId)).toHaveLength(1);
  });

  it("上限が無制限なら金額に関わらず invoice_sent になる", async () => {
    const { orderId, itemIds } = await seedOrder([
      { price: 10_000_000, timing: "after_order" },
    ]);

    expect(
      await createInvoice(orderId, itemIds, MonthlyLimit.unlimited())
    ).toBe("invoice_sent");
  });

  it("上限を超えるなら limit_exceeded の決済単位だけが記録され、注文は limit_exceeded になる", async () => {
    const { orderId, itemIds } = await seedOrder([
      { price: 60_000, timing: "after_order" },
    ]);
    const settlementId = newId();

    const result = await createInvoice(
      orderId,
      itemIds,
      MonthlyLimit.of(50_000),
      settlementId
    );

    expect(result).toBe("limit_exceeded");
    expect(await settlementsOf(orderId)).toEqual([
      {
        id: settlementId,
        flow: "invoice",
        status: "limit_exceeded",
        amount_snapshot: 60_000,
        stripe_invoice_id: null,
      },
    ]);
    // 運営者が決済単位をキャンセルすると明細が未請求に戻れるよう、明細は紐付ける
    expect(await settlementIdsOf(itemIds)).toEqual({
      [itemIds[0]!]: settlementId,
    });
    expect(await statusOf(orderId)).toBe("limit_exceeded");
    expect((await historyOf(orderId))[1]).toEqual({
      from_status: "processing",
      to_status: "limit_exceeded",
      changed_by: "admin",
      changed_by_admin_user_id: ADMIN_USER_ID,
    });
  });

  it("判定は all-or-nothing: 一部の明細だけなら上限内でも、選んだ全明細を1つの limit_exceeded にする", async () => {
    const { orderId, itemIds } = await seedOrder([
      { price: 30_000, timing: "after_order" },
      { price: 30_000, timing: "after_order" },
    ]);

    const result = await createInvoice(
      orderId,
      itemIds,
      MonthlyLimit.of(50_000)
    );

    expect(result).toBe("limit_exceeded");
    const settlements = await settlementsOf(orderId);
    expect(settlements).toHaveLength(1);
    expect(settlements[0]!.status).toBe("limit_exceeded");
    expect(settlements[0]!.amount_snapshot).toBe(60_000);
    expect(new Set(Object.values(await settlementIdsOf(itemIds)))).toEqual(
      new Set([settlements[0]!.id])
    );
  });

  describe("確定額の集計（place_order_with_limit_check と共通）", () => {
    it("同じ期間の他の注文の確定額を含めて判定する", async () => {
      await seedOrder([{ price: 40_000, timing: "at_order" }]);
      const { orderId, itemIds } = await seedOrder([
        { price: 20_000, timing: "after_order" },
      ]);

      // 他の注文 40,000 + 選んだ明細 20,000 = 60,000 > 50,000
      expect(
        await createInvoice(orderId, itemIds, MonthlyLimit.of(50_000))
      ).toBe("limit_exceeded");
    });

    it("選んだ明細は未請求のまま確定額に含まれているが、二重には数えない", async () => {
      await seedOrder([{ price: 40_000, timing: "at_order" }]);
      const { orderId, itemIds } = await seedOrder([
        { price: 20_000, timing: "after_order" },
      ]);

      // 二重に数えると 40,000 + 20,000 + 20,000 = 80,000 > 60,000 になってしまう
      expect(
        await createInvoice(orderId, itemIds, MonthlyLimit.of(60_000))
      ).toBe("invoice_sent");
    });

    it("キャンセル済みの注文・キャンセル済みの決済単位の明細は数えない", async () => {
      const cancelledOrder = await seedOrder([
        { price: 40_000, timing: "at_order" },
      ]);
      const order = await repo.findById(cancelledOrder.orderId);
      await repo.save(order!.cancel(new Date()), { type: "system" });
      const { orderId, itemIds } = await seedOrder([
        { price: 20_000, timing: "after_order" },
      ]);

      expect(
        await createInvoice(orderId, itemIds, MonthlyLimit.of(50_000))
      ).toBe("invoice_sent");
    });

    it("注文確定の上限チェックも、同じ集計で他の注文の未請求の後払い明細を数える", async () => {
      await seedOrder([{ price: 40_000, timing: "after_order" }]);
      const placed = reconstituteOrder({
        id: newId(),
        userId: USER_ID,
        status: OrderStatus.of("processing"),
        shippingAddress: AddressSnapshot.of(snapshotProps),
        billingAddress: AddressSnapshot.of(snapshotProps),
        rankAtOrder: MemberRank.of("starter"),
        monthlyLimitAtOrder: MonthlyLimit.of(50_000),
        items: [
          reconstituteOrderItem({
            id: newId(),
            sanityProductId: "prod-393",
            productNameSnapshot: "請求作成テスト商品",
            unitPriceSnapshot: Money.of(20_000),
            quantity: 1,
            isNegotiable: false,
            negotiatedUnitPrice: null,
            paymentTiming: "after_order",
            settlementId: null,
          }),
        ],
        settlements: [],
        createdAt: ORDERED_AT,
      });

      await expect(
        repo.saveNewOrderWithLimitCheck(
          placed,
          PERIOD,
          MonthlyLimit.of(50_000),
          Money.of(20_000)
        )
      ).rejects.toBeInstanceOf(LimitExceededError);
    });
  });

  describe("請求できない明細を含めると失敗し、何も変えない", () => {
    async function expectNoInvoiceSettlement(orderId: string) {
      expect(await settlementsOf(orderId)).toEqual([]);
    }

    it("すでに settlement_id がある明細", async () => {
      const { orderId, itemIds } = await seedOrder([
        { price: 10_000, timing: "after_order" },
        { price: 10_000, timing: "after_order" },
      ]);
      const firstSettlementId = newId();
      await createInvoice(
        orderId,
        [itemIds[0]!],
        MonthlyLimit.of(300_000),
        firstSettlementId
      );

      await expect(
        createInvoice(orderId, itemIds, MonthlyLimit.of(300_000))
      ).rejects.toThrow(/already_settled/);

      expect(await settlementsOf(orderId)).toHaveLength(1);
      expect(await settlementIdsOf(itemIds)).toEqual({
        [itemIds[0]!]: firstSettlementId,
        [itemIds[1]!]: null,
      });
    });

    it("at_order の明細", async () => {
      const { orderId, itemIds } = await seedOrder([
        { price: 10_000, timing: "at_order" },
        { price: 10_000, timing: "after_order" },
      ]);
      const before = await settlementIdsOf(itemIds);

      await expect(
        createInvoice(orderId, itemIds, MonthlyLimit.of(300_000))
      ).rejects.toThrow(/not_after_order/);

      await expectNoInvoiceSettlement(orderId);
      expect(await settlementIdsOf(itemIds)).toEqual(before);
    });

    it("キャンセル済みの注文の明細", async () => {
      const { orderId, itemIds } = await seedOrder([
        { price: 10_000, timing: "after_order" },
      ]);
      const order = await repo.findById(orderId);
      await repo.save(order!.cancel(new Date()), { type: "system" });

      await expect(
        createInvoice(orderId, itemIds, MonthlyLimit.of(300_000))
      ).rejects.toThrow(/order_cancelled/);

      await expectNoInvoiceSettlement(orderId);
      expect(await settlementIdsOf(itemIds)).toEqual({ [itemIds[0]!]: null });
    });

    it("別の注文の明細（1回の請求は1注文の明細に限る）", async () => {
      const a = await seedOrder([{ price: 10_000, timing: "after_order" }]);
      const b = await seedOrder([{ price: 10_000, timing: "after_order" }]);

      await expect(
        createInvoice(
          a.orderId,
          [...a.itemIds, ...b.itemIds],
          MonthlyLimit.of(300_000)
        )
      ).rejects.toThrow(/item_not_in_order/);

      await expectNoInvoiceSettlement(a.orderId);
      expect(await settlementIdsOf([...a.itemIds, ...b.itemIds])).toEqual({
        [a.itemIds[0]!]: null,
        [b.itemIds[0]!]: null,
      });
    });

    it("存在しない明細", async () => {
      const { orderId, itemIds } = await seedOrder([
        { price: 10_000, timing: "after_order" },
      ]);

      await expect(
        createInvoice(orderId, [...itemIds, newId()], MonthlyLimit.of(300_000))
      ).rejects.toThrow(/item_not_in_order/);

      await expectNoInvoiceSettlement(orderId);
    });

    it("価格が決まっていない明細（要相談商品。Ver1 では注文できないが、0円の請求を作らせない）", async () => {
      const { orderId, itemIds } = await seedOrder([
        { price: 10_000, timing: "after_order" },
      ]);
      const { error } = await supabase
        .from("order_items")
        .update({ unit_price_snapshot: null, is_negotiable: true })
        .in("id", itemIds);
      if (error) throw error;

      await expect(
        createInvoice(orderId, itemIds, MonthlyLimit.of(300_000))
      ).rejects.toThrow(/price_not_fixed/);

      await expectNoInvoiceSettlement(orderId);
    });

    it("明細を1件も選んでいない", async () => {
      const { orderId } = await seedOrder([
        { price: 10_000, timing: "after_order" },
      ]);

      await expect(
        createInvoice(orderId, [], MonthlyLimit.of(300_000))
      ).rejects.toThrow(/no_items/);

      expect(await settlementsOf(orderId)).toEqual([]);
    });
  });

  describe("同時実行", () => {
    it("同じユーザーの注文確定と請求作成を同時に実行しても、上限を超えて確定しない", async () => {
      // 上限 300,000 に対し、未請求の後払い 150,000 がすでに確定額に入っている。
      // 200,000 の注文確定は 350,000 になり超過する。請求作成はすでに数えた金額を
      // Invoice に変えるだけなので上限内。どちらの順に直列化されても結果は同じになる
      const { orderId, itemIds } = await seedOrder([
        { price: 150_000, timing: "after_order" },
      ]);
      const placed = reconstituteOrder({
        id: newId(),
        userId: USER_ID,
        status: OrderStatus.of("processing"),
        shippingAddress: AddressSnapshot.of(snapshotProps),
        billingAddress: AddressSnapshot.of(snapshotProps),
        rankAtOrder: MemberRank.of("starter"),
        monthlyLimitAtOrder: MonthlyLimit.of(300_000),
        items: [
          reconstituteOrderItem({
            id: newId(),
            sanityProductId: "prod-393",
            productNameSnapshot: "請求作成テスト商品",
            unitPriceSnapshot: Money.of(200_000),
            quantity: 1,
            isNegotiable: false,
            negotiatedUnitPrice: null,
            paymentTiming: "after_order",
            settlementId: null,
          }),
        ],
        settlements: [],
        createdAt: ORDERED_AT,
      });

      const [placeResult, invoiceResult] = await Promise.allSettled([
        repo.saveNewOrderWithLimitCheck(
          placed,
          PERIOD,
          MonthlyLimit.of(300_000),
          Money.of(200_000)
        ),
        createInvoice(orderId, itemIds, MonthlyLimit.of(300_000)),
      ]);

      expect(placeResult.status).toBe("rejected");
      expect((placeResult as PromiseRejectedResult).reason).toBeInstanceOf(
        LimitExceededError
      );
      expect(invoiceResult).toEqual({
        status: "fulfilled",
        value: "invoice_sent",
      });

      const { data: items } = await supabase
        .from("order_items")
        .select("unit_price_snapshot, quantity, orders!inner(user_id)")
        .eq("orders.user_id", USER_ID);
      const total = (items ?? []).reduce(
        (sum, i) => sum + (i.unit_price_snapshot ?? 0) * i.quantity,
        0
      );
      expect(total).toBeLessThanOrEqual(300_000);
    });

    it("同じ明細の請求作成を同時に実行しても、決済単位は1件しか作られない", async () => {
      const { orderId, itemIds } = await seedOrder([
        { price: 10_000, timing: "after_order" },
      ]);

      const results = await Promise.allSettled([
        createInvoice(orderId, itemIds, MonthlyLimit.of(300_000)),
        createInvoice(orderId, itemIds, MonthlyLimit.of(300_000)),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((r) => r.status === "rejected");
      expect((rejected as PromiseRejectedResult).reason.message).toMatch(
        /already_settled/
      );
      expect(await settlementsOf(orderId)).toHaveLength(1);
    });
  });

  describe("実行権限", () => {
    it("anon からは実行できない", async () => {
      const { orderId, itemIds } = await seedOrder([
        { price: 10_000, timing: "after_order" },
      ]);
      const anonRepo = new SupabaseOrderRepository(
        createClient<Database>(supabaseUrl, anonKey, {
          auth: { persistSession: false },
        })
      );

      await expect(
        createInvoice(
          orderId,
          itemIds,
          MonthlyLimit.of(300_000),
          newId(),
          anonRepo
        )
      ).rejects.toThrow(
        /permission denied for function create_invoice_settlement_with_limit_check/
      );
      expect(await settlementsOf(orderId)).toEqual([]);
    });

    it("authenticated（会員のトークン）からは実行できない", async () => {
      const { orderId, itemIds } = await seedOrder([
        { price: 10_000, timing: "after_order" },
      ]);
      const memberRepo = new SupabaseOrderRepository(
        createClient<Database>(supabaseUrl, anonKey, {
          auth: { persistSession: false },
          global: {
            headers: {
              Authorization: `Bearer ${signTestJwt({ sub: CLERK_ID })}`,
            },
          },
        })
      );

      await expect(
        createInvoice(
          orderId,
          itemIds,
          MonthlyLimit.of(300_000),
          newId(),
          memberRepo
        )
      ).rejects.toThrow(
        /permission denied for function create_invoice_settlement_with_limit_check/
      );
      expect(await settlementsOf(orderId)).toEqual([]);
    });

    it("確定額の集計の関数も anon・authenticated からは実行できない", async () => {
      for (const client of [
        createClient<Database>(supabaseUrl, anonKey, {
          auth: { persistSession: false },
        }),
        createClient<Database>(supabaseUrl, anonKey, {
          auth: { persistSession: false },
          global: {
            headers: {
              Authorization: `Bearer ${signTestJwt({ sub: CLERK_ID })}`,
            },
          },
        }),
      ]) {
        const { error } = await client.rpc("confirmed_amount_in_period", {
          p_user_id: USER_ID,
          p_period_start: PERIOD.start.toISOString(),
          p_period_end: PERIOD.end.toISOString(),
        });
        expect(error?.message).toMatch(
          /permission denied for function confirmed_amount_in_period/
        );
      }
    });
  });
});
