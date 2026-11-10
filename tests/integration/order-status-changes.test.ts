import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";
import { SupabaseOrderRepository } from "@/infrastructure/supabase/supabase-order-repository";
import { reconstituteOrder } from "@/domain/entities/order";
import { reconstituteOrderItem } from "@/domain/entities/order-item";
import { reconstituteOrderSettlement } from "@/domain/entities/order-settlement";
import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";

// order_status_changes（#237）: orders.status の変更履歴。追記専用で、状態の更新と同じトランザクションで書く

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

const USER_A_ID = "00000000-0000-0000-0000-0000002370a1";
const USER_B_ID = "00000000-0000-0000-0000-0000002370b1";
const CLERK_A = "clerk_test_order_status_changes_a";
const CLERK_B = "clerk_test_order_status_changes_b";
const ADMIN_USER_ID = "00000000-0000-0000-0000-0000002370f1";
// admin_users に存在しない運営者ID（履歴のINSERTを外部キーで失敗させる）
const MISSING_ADMIN_USER_ID = "00000000-0000-0000-0000-0000002370f9";

const ORDER_A_ID = "00000000-0000-0000-0000-000000237001";
const ORDER_B_ID = "00000000-0000-0000-0000-000000237002";
const ORDER_PLACED_ID = "00000000-0000-0000-0000-000000237003";
const ORDER_DELETE_ID = "00000000-0000-0000-0000-000000237004";
const ALL_ORDER_IDS = [
  ORDER_A_ID,
  ORDER_B_ID,
  ORDER_PLACED_ID,
  ORDER_DELETE_ID,
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

// at_order の明細1件と、その Checkout の決済単位（Session 未作成）を持つ注文
function makeOrder(orderId: string, userId: string, suffix: string) {
  const settlementId = `00000000-0000-0000-0000-0000002371${suffix}`;
  return reconstituteOrder({
    id: orderId,
    userId,
    status: OrderStatus.of("processing"),
    shippingAddress: AddressSnapshot.of(snapshotProps),
    billingAddress: AddressSnapshot.of(snapshotProps),
    rankAtOrder: MemberRank.of("basic"),
    monthlyLimitAtOrder: Money.of(1_000_000),
    items: [
      reconstituteOrderItem({
        id: `00000000-0000-0000-0000-0000002372${suffix}`,
        sanityProductId: "prod-237",
        productNameSnapshot: "テスト商品",
        unitPriceSnapshot: Money.of(10_000),
        quantity: 1,
        isNegotiable: false,
        negotiatedUnitPrice: null,
        paymentTiming: "at_order",
        settlementId,
      }),
    ],
    settlements: [
      reconstituteOrderSettlement({
        id: settlementId,
        orderId,
        flow: "checkout",
        status: "pending_payment",
        stripeCheckoutSessionId: null,
        stripeInvoiceId: null,
        amount: Money.of(10_000),
        paidAt: null,
        cancelledAt: null,
      }),
    ],
    createdAt: new Date(2026, 5, 12),
  });
}

async function historyOf(orderId: string) {
  const { data, error } = await supabase
    .from("order_status_changes")
    .select(
      "from_status, to_status, changed_by, changed_by_admin_user_id, reason"
    )
    .eq("order_id", orderId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

async function cleanup() {
  // 履歴は注文の削除と一緒に消える（ON DELETE CASCADE）
  await supabase.from("order_items").delete().in("order_id", ALL_ORDER_IDS);
  await supabase
    .from("order_settlements")
    .delete()
    .in("order_id", ALL_ORDER_IDS);
  await supabase.from("orders").delete().in("id", ALL_ORDER_IDS);
}

const repo = new SupabaseOrderRepository(supabase);

beforeAll(async () => {
  await cleanup();
  await supabase.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
  await supabase.from("admin_users").delete().eq("id", ADMIN_USER_ID);
  for (const [id, clerkId] of [
    [USER_A_ID, CLERK_A],
    [USER_B_ID, CLERK_B],
  ]) {
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
  const { error: adminError } = await supabase.from("admin_users").insert({
    id: ADMIN_USER_ID,
    clerk_user_id: "clerk_test_order_status_changes_admin",
    name: "運営 太郎",
    email: "order-status-changes-admin@example.com",
  });
  if (adminError) throw adminError;

  await repo.save(makeOrder(ORDER_A_ID, USER_A_ID, "a1"), { type: "system" });
  await repo.save(makeOrder(ORDER_B_ID, USER_B_ID, "b1"), { type: "system" });
});

afterAll(async () => {
  await cleanup();
  await supabase.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
  await supabase.from("admin_users").delete().eq("id", ADMIN_USER_ID);
});

describe("order_status_changes", () => {
  describe("注文の保存（SupabaseOrderRepository.save）", () => {
    it("新しい注文を保存すると、from_status = NULL の最初の1行が記録される", async () => {
      expect(await historyOf(ORDER_A_ID)).toEqual([
        {
          from_status: null,
          to_status: "processing",
          changed_by: "system",
          changed_by_admin_user_id: null,
          reason: null,
        },
      ]);
    });

    it("orders.status が変わらない保存では行が増えない", async () => {
      const order = await repo.findById(ORDER_A_ID);
      const settlement = order!.settlements[0]!;
      await repo.save(
        order!.applySettlement(
          settlement.attachCheckoutSession("cs_test_order_status_changes_a1")
        ),
        { type: "customer" }
      );

      expect(await historyOf(ORDER_A_ID)).toHaveLength(1);
    });

    it("運営者が状態を変えたときは、changed_by='admin' と admin_users.id が記録される", async () => {
      const order = await repo.findById(ORDER_A_ID);
      await repo.save(order!.cancel(new Date()), {
        type: "admin",
        adminUserId: ADMIN_USER_ID,
      });

      const history = await historyOf(ORDER_A_ID);
      expect(history).toHaveLength(2);
      expect(history[1]).toEqual({
        from_status: "processing",
        to_status: "cancelled",
        changed_by: "admin",
        changed_by_admin_user_id: ADMIN_USER_ID,
        reason: null,
      });
    });

    it("履歴のINSERTが失敗したら、注文の状態・決済単位の更新も反映されない", async () => {
      const order = await repo.findById(ORDER_B_ID);

      await expect(
        repo.save(order!.cancel(new Date()), {
          type: "admin",
          adminUserId: MISSING_ADMIN_USER_ID,
        })
      ).rejects.toThrow("Order保存に失敗");

      const reloaded = await repo.findById(ORDER_B_ID);
      expect(reloaded!.status.value).toBe("processing");
      expect(reloaded!.settlements[0]?.status).toBe("pending_payment");
      expect(await historyOf(ORDER_B_ID)).toHaveLength(1);
    });

    it("状態の更新が失敗したら、履歴も記録されない", async () => {
      // OrderStatus は不正な値を作れないため、関数を直接呼んで orders の CHECK 制約で失敗させる
      const { error } = await supabase.rpc("save_order", {
        p_order: {
          id: ORDER_B_ID,
          user_id: USER_B_ID,
          status: "no_such_status",
          shipping_address_snapshot: snapshotProps,
          billing_address_snapshot: snapshotProps,
          rank_at_order: "basic",
          monthly_limit_at_order: 1_000_000,
          created_at: new Date(2026, 5, 12).toISOString(),
        },
        p_settlements: [],
        p_items: [],
        p_status_change: { changed_by: "system" },
      });
      expect(error?.message).toMatch(/orders_status_check/);

      expect((await repo.findById(ORDER_B_ID))!.status.value).toBe(
        "processing"
      );
      expect(await historyOf(ORDER_B_ID)).toHaveLength(1);
    });

    it("会員のトークンからは save_order を呼べない", async () => {
      const memberRepo = new SupabaseOrderRepository(clientAs(CLERK_B));
      const order = await repo.findById(ORDER_B_ID);

      await expect(
        memberRepo.save(order!.cancel(new Date()), { type: "customer" })
      ).rejects.toThrow(/permission denied for function save_order/);
      expect(await historyOf(ORDER_B_ID)).toHaveLength(1);
    });
  });

  describe("注文確定（place_order_with_limit_check）", () => {
    it("from_status = NULL・changed_by='customer' の最初の1行が記録される", async () => {
      const period = MonthlyPeriod.fromSubscribedAt(
        new Date(2026, 0, 10),
        new Date(2026, 5, 15)
      );
      await repo.saveNewOrderWithLimitCheck(
        makeOrder(ORDER_PLACED_ID, USER_B_ID, "c1"),
        period,
        Money.of(1_000_000),
        Money.of(10_000)
      );

      expect(await historyOf(ORDER_PLACED_ID)).toEqual([
        {
          from_status: null,
          to_status: "processing",
          changed_by: "customer",
          changed_by_admin_user_id: null,
          reason: null,
        },
      ]);
    });
  });

  describe("追記専用", () => {
    it("service role でも UPDATE できない", async () => {
      const { error } = await supabase
        .from("order_status_changes")
        .update({ to_status: "paid" })
        .eq("order_id", ORDER_A_ID);
      expect(error?.message).toMatch(/order_status_changes は追記専用/);
      expect((await historyOf(ORDER_A_ID))[1]?.to_status).toBe("cancelled");
    });

    it("service role でも DELETE できない", async () => {
      const { error } = await supabase
        .from("order_status_changes")
        .delete()
        .eq("order_id", ORDER_A_ID);
      expect(error?.message).toMatch(/order_status_changes は追記専用/);
      expect(await historyOf(ORDER_A_ID)).toHaveLength(2);
    });

    it("注文の削除（注文確定の補償削除）では、その注文の履歴も一緒に消える", async () => {
      await repo.save(makeOrder(ORDER_DELETE_ID, USER_A_ID, "d1"), {
        type: "customer",
      });
      expect(await historyOf(ORDER_DELETE_ID)).toHaveLength(1);

      await repo.delete(ORDER_DELETE_ID);

      expect(await repo.findById(ORDER_DELETE_ID)).toBeNull();
      expect(await historyOf(ORDER_DELETE_ID)).toEqual([]);
    });

    it("changed_by='admin' は運営者IDが必須で、それ以外は運営者IDを持てない", async () => {
      const { error: adminWithoutId } = await supabase
        .from("order_status_changes")
        .insert({
          order_id: ORDER_A_ID,
          from_status: "cancelled",
          to_status: "cancelled",
          changed_by: "admin",
        });
      expect(adminWithoutId?.message).toMatch(
        /order_status_changes_admin_user_check/
      );

      const { error: systemWithId } = await supabase
        .from("order_status_changes")
        .insert({
          order_id: ORDER_A_ID,
          from_status: "cancelled",
          to_status: "cancelled",
          changed_by: "system",
          changed_by_admin_user_id: ADMIN_USER_ID,
        });
      expect(systemWithId?.message).toMatch(
        /order_status_changes_admin_user_check/
      );
    });
  });

  describe("RLS", () => {
    it("会員は自分の注文の履歴だけを参照できる", async () => {
      const { data, error } = await clientAs(CLERK_A)
        .from("order_status_changes")
        .select("order_id, to_status")
        .in("order_id", [ORDER_A_ID, ORDER_B_ID, ORDER_PLACED_ID]);
      expect(error).toBeNull();
      expect(data?.map((r) => r.order_id)).toEqual([ORDER_A_ID, ORDER_A_ID]);
    });

    it("会員は他の会員の注文の履歴を参照できない", async () => {
      const { data, error } = await clientAs(CLERK_A)
        .from("order_status_changes")
        .select("order_id")
        .eq("order_id", ORDER_B_ID);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    });

    it("会員は自分の注文の履歴でもINSERTできない", async () => {
      const { error } = await clientAs(CLERK_A)
        .from("order_status_changes")
        .insert({
          order_id: ORDER_A_ID,
          from_status: "cancelled",
          to_status: "paid",
          changed_by: "customer",
        });
      expect(error?.message).toMatch(/row-level security/);
      expect(await historyOf(ORDER_A_ID)).toHaveLength(2);
    });

    it("会員は自分の注文の履歴でもUPDATE・DELETEできない", async () => {
      const member = clientAs(CLERK_A);
      await member
        .from("order_status_changes")
        .update({ to_status: "paid" })
        .eq("order_id", ORDER_A_ID);
      await member
        .from("order_status_changes")
        .delete()
        .eq("order_id", ORDER_A_ID);

      const history = await historyOf(ORDER_A_ID);
      expect(history).toHaveLength(2);
      expect(history[1]?.to_status).toBe("cancelled");
    });
  });
});
