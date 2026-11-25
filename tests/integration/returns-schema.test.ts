import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";
import { randomOrderNumber } from "../helpers/order-number";

type ReturnsInsert = Database["public"]["Tables"]["returns"]["Insert"];

// returns / return_items（#232）: 注文確定後のキャンセル・返品・返金の申請。
// 業務ルールの正は docs/domain/returns.md。会員は自分の注文への requested の申請の
// INSERT と参照だけができ、運営者の書き込みは管理画面API（service role）に一本化する

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

const USER_A_ID = "00000000-0000-0000-0000-0000002320a1";
const USER_B_ID = "00000000-0000-0000-0000-0000002320b1";
const CLERK_A = "clerk_test_returns_schema_a";
const CLERK_B = "clerk_test_returns_schema_b";
const ADMIN_USER_ID = "00000000-0000-0000-0000-0000002320f1";

// 会員Aの注文2つ（ORDER_A は明細2つ）と、会員Bの注文1つ
const ORDER_A_ID = "00000000-0000-0000-0000-000000232001";
const ORDER_A2_ID = "00000000-0000-0000-0000-000000232002";
const ORDER_B_ID = "00000000-0000-0000-0000-000000232003";
const ALL_ORDER_IDS = [ORDER_A_ID, ORDER_A2_ID, ORDER_B_ID];
const ITEM_A1_ID = "00000000-0000-0000-0000-000000232101";
const ITEM_A2_ID = "00000000-0000-0000-0000-000000232102";
const ITEM_A2_OTHER_ORDER_ID = "00000000-0000-0000-0000-000000232103";
const ITEM_B_ID = "00000000-0000-0000-0000-000000232104";

// service role で用意する申請（会員Aの申請中・会員Aの承認済み・会員Bの申請中）
const RETURN_A_ID = "00000000-0000-0000-0000-000000232201";
const RETURN_A_APPROVED_ID = "00000000-0000-0000-0000-000000232202";
const RETURN_B_ID = "00000000-0000-0000-0000-000000232203";
const RETURN_ITEM_A_ID = "00000000-0000-0000-0000-000000232301";
const RETURN_ITEM_B_ID = "00000000-0000-0000-0000-000000232302";

// 会員がINSERTを試みる申請・明細のID（拒否されたら行が無いことを確かめる）
const MEMBER_RETURN_ID = "00000000-0000-0000-0000-000000232401";
const MEMBER_RETURN_ITEM_ID = "00000000-0000-0000-0000-000000232501";
const REJECTED_ID = "00000000-0000-0000-0000-000000232499";

const baseOrder = {
  shipping_address_snapshot: {},
  billing_address_snapshot: {},
  rank_at_order: "basic" as const,
  monthly_limit_at_order: 1_000_000,
  status: "paid",
};

const baseItem = {
  sanity_product_id: "prod-232",
  product_name_snapshot: "テスト商品",
  unit_price_snapshot: 10_000,
  quantity: 3,
  payment_timing: "at_order",
};

async function cleanup() {
  // return_items は申請の削除と一緒に消える（ON DELETE CASCADE）
  await supabase.from("returns").delete().in("order_id", ALL_ORDER_IDS);
  await supabase.from("order_items").delete().in("order_id", ALL_ORDER_IDS);
  await supabase.from("orders").delete().in("id", ALL_ORDER_IDS);
  await supabase.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
  await supabase.from("admin_users").delete().eq("id", ADMIN_USER_ID);
}

async function returnExists(id: string) {
  const { data, error } = await supabase
    .from("returns")
    .select("id")
    .eq("id", id);
  if (error) throw error;
  return data.length > 0;
}

async function returnItemExists(id: string) {
  const { data, error } = await supabase
    .from("return_items")
    .select("id")
    .eq("id", id);
  if (error) throw error;
  return data.length > 0;
}

beforeAll(async () => {
  await cleanup();
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
    clerk_user_id: "clerk_test_returns_schema_admin",
    name: "運営 太郎",
    email: "returns-schema-admin@example.com",
  });
  if (adminError) throw adminError;

  const { error: ordersError } = await supabase.from("orders").insert([
    {
      order_number: randomOrderNumber(),
      ...baseOrder,
      id: ORDER_A_ID,
      user_id: USER_A_ID,
    },
    {
      order_number: randomOrderNumber(),
      ...baseOrder,
      id: ORDER_A2_ID,
      user_id: USER_A_ID,
    },
    {
      order_number: randomOrderNumber(),
      ...baseOrder,
      id: ORDER_B_ID,
      user_id: USER_B_ID,
    },
  ]);
  if (ordersError) throw ordersError;
  const { error: itemsError } = await supabase.from("order_items").insert([
    { ...baseItem, id: ITEM_A1_ID, order_id: ORDER_A_ID },
    { ...baseItem, id: ITEM_A2_ID, order_id: ORDER_A_ID },
    { ...baseItem, id: ITEM_A2_OTHER_ORDER_ID, order_id: ORDER_A2_ID },
    { ...baseItem, id: ITEM_B_ID, order_id: ORDER_B_ID },
  ]);
  if (itemsError) throw itemsError;

  const { error: returnsError } = await supabase.from("returns").insert([
    {
      id: RETURN_A_ID,
      order_id: ORDER_A_ID,
      status: "requested",
      requested_by_user_id: USER_A_ID,
      reason: "不良品",
      admin_note: "着払い伝票を送付済み",
    },
    {
      id: RETURN_A_APPROVED_ID,
      order_id: ORDER_A_ID,
      status: "approved",
      requested_by_user_id: USER_A_ID,
      reviewed_by_admin_user_id: ADMIN_USER_ID,
      reason: "誤配送",
      approved_at: new Date().toISOString(),
    },
    {
      id: RETURN_B_ID,
      order_id: ORDER_B_ID,
      status: "requested",
      requested_by_user_id: USER_B_ID,
      reason: "不良品",
    },
  ]);
  if (returnsError) throw returnsError;
  const { error: returnItemsError } = await supabase
    .from("return_items")
    .insert([
      {
        id: RETURN_ITEM_A_ID,
        return_id: RETURN_A_ID,
        order_item_id: ITEM_A1_ID,
        quantity: 1,
      },
      {
        id: RETURN_ITEM_B_ID,
        return_id: RETURN_B_ID,
        order_item_id: ITEM_B_ID,
        quantity: 1,
      },
    ]);
  if (returnItemsError) throw returnItemsError;
});

afterAll(async () => {
  await cleanup();
});

describe("returns / return_items", () => {
  describe("制約", () => {
    it("status は6値以外を入れられない", async () => {
      const { error } = await supabase.from("returns").insert({
        id: REJECTED_ID,
        order_id: ORDER_A_ID,
        status: "shipped",
        requested_by_user_id: USER_A_ID,
        reason: "不良品",
      });
      expect(error?.message).toMatch(/returns_status_check/);
    });

    it("6値の status はすべて入れられる", async () => {
      const statuses = [
        "requested",
        "approved",
        "rejected",
        "received",
        "refunded",
        "cancelled",
      ];
      const ids = statuses.map(
        (_, i) => `00000000-0000-0000-0000-00000023260${i}`
      );
      const { error } = await supabase.from("returns").insert(
        statuses.map((status, i) => ({
          id: ids[i],
          order_id: ORDER_B_ID,
          status,
          requested_by_user_id: USER_B_ID,
          reason: "不良品",
        }))
      );
      expect(error).toBeNull();
      await supabase.from("returns").delete().in("id", ids);
    });

    it("stripe_refund_id は重複できない", async () => {
      const { error: first } = await supabase
        .from("returns")
        .update({ stripe_refund_id: "re_test_returns_schema_dup" })
        .eq("id", RETURN_A_APPROVED_ID);
      expect(first).toBeNull();

      const { error } = await supabase
        .from("returns")
        .update({ stripe_refund_id: "re_test_returns_schema_dup" })
        .eq("id", RETURN_B_ID);
      expect(error?.message).toMatch(/returns_stripe_refund_id_key/);

      await supabase
        .from("returns")
        .update({ stripe_refund_id: null })
        .eq("id", RETURN_A_APPROVED_ID);
    });

    it("運営者が直接作る申請（回収不能処理）は、申請した会員の代わりに起票した運営者を持つ", async () => {
      const { error } = await supabase.from("returns").insert({
        id: REJECTED_ID,
        order_id: ORDER_B_ID,
        status: "approved",
        created_by_admin_user_id: ADMIN_USER_ID,
        reason: "回収不能（未払い放置）",
      });
      expect(error).toBeNull();
      await supabase.from("returns").delete().eq("id", REJECTED_ID);
    });

    it("申請した会員と起票した運営者は、どちらか一方だけを持つ", async () => {
      const { error: neither } = await supabase.from("returns").insert({
        id: REJECTED_ID,
        order_id: ORDER_B_ID,
        reason: "不良品",
      });
      expect(neither?.message).toMatch(/returns_requester_check/);

      const { error: both } = await supabase.from("returns").insert({
        id: REJECTED_ID,
        order_id: ORDER_B_ID,
        requested_by_user_id: USER_B_ID,
        created_by_admin_user_id: ADMIN_USER_ID,
        reason: "不良品",
      });
      expect(both?.message).toMatch(/returns_requester_check/);
    });

    it("return_items.quantity は1以上", async () => {
      const { error } = await supabase.from("return_items").insert({
        return_id: RETURN_A_ID,
        order_item_id: ITEM_A2_ID,
        quantity: 0,
      });
      expect(error?.message).toMatch(/return_items_quantity_check/);
    });

    it("returns を更新すると updated_at が進む", async () => {
      const { data: before } = await supabase
        .from("returns")
        .select("updated_at")
        .eq("id", RETURN_B_ID)
        .single();
      await supabase
        .from("returns")
        .update({ admin_note: "確認中" })
        .eq("id", RETURN_B_ID);
      const { data: after } = await supabase
        .from("returns")
        .select("updated_at")
        .eq("id", RETURN_B_ID)
        .single();
      expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
        new Date(before!.updated_at).getTime()
      );
    });
  });

  describe("RLS: 参照", () => {
    it("会員は自分の注文への申請だけを参照できる", async () => {
      const { data, error } = await clientAs(CLERK_A)
        .from("returns")
        .select("id, order_id, status, reason")
        .in("id", [RETURN_A_ID, RETURN_A_APPROVED_ID, RETURN_B_ID])
        .order("id");
      expect(error).toBeNull();
      expect(data?.map((r) => r.id)).toEqual([
        RETURN_A_ID,
        RETURN_A_APPROVED_ID,
      ]);
    });

    it("会員は自分の注文への申請の明細だけを参照できる", async () => {
      const { data, error } = await clientAs(CLERK_A)
        .from("return_items")
        .select("id, return_id, order_item_id, quantity, refund_amount")
        .in("id", [RETURN_ITEM_A_ID, RETURN_ITEM_B_ID]);
      expect(error).toBeNull();
      expect(data?.map((r) => r.id)).toEqual([RETURN_ITEM_A_ID]);
    });

    it("会員は他の会員の申請・明細を参照できない", async () => {
      const member = clientAs(CLERK_A);
      const { data: returns, error: returnsError } = await member
        .from("returns")
        .select("id")
        .eq("id", RETURN_B_ID);
      expect(returnsError).toBeNull();
      expect(returns).toEqual([]);

      const { data: items, error: itemsError } = await member
        .from("return_items")
        .select("id")
        .eq("return_id", RETURN_B_ID);
      expect(itemsError).toBeNull();
      expect(items).toEqual([]);
    });

    it.each([
      "admin_note",
      "reviewed_by_admin_user_id",
      "created_by_admin_user_id",
    ])("会員は自分の申請でも運営の内部情報（%s）を読めない", async (column) => {
      const { data, error } = await clientAs(CLERK_A)
        .from("returns")
        .select(column)
        .eq("id", RETURN_A_ID);
      expect(error?.message).toMatch(/permission denied/);
      expect(data).toBeNull();
    });

    it("会員は select('*') でも運営の内部情報を読めない", async () => {
      const { data, error } = await clientAs(CLERK_A)
        .from("returns")
        .select("*")
        .eq("id", RETURN_A_ID);
      expect(error?.message).toMatch(/permission denied/);
      expect(data).toBeNull();
    });
  });

  describe("RLS: 会員からの申請", () => {
    it("会員は自分の注文に requested の申請と、その明細をINSERTできる", async () => {
      const member = clientAs(CLERK_A);
      const { error } = await member.from("returns").insert({
        id: MEMBER_RETURN_ID,
        order_id: ORDER_A_ID,
        status: "requested",
        requested_by_user_id: USER_A_ID,
        reason: "不良品",
      });
      expect(error).toBeNull();

      const { error: itemError } = await member.from("return_items").insert({
        id: MEMBER_RETURN_ITEM_ID,
        return_id: MEMBER_RETURN_ID,
        order_item_id: ITEM_A2_ID,
        quantity: 2,
      });
      expect(itemError).toBeNull();

      const { data } = await supabase
        .from("returns")
        .select(
          "status, requested_by_user_id, return_items(order_item_id, quantity)"
        )
        .eq("id", MEMBER_RETURN_ID)
        .single();
      expect(data).toEqual({
        status: "requested",
        requested_by_user_id: USER_A_ID,
        return_items: [{ order_item_id: ITEM_A2_ID, quantity: 2 }],
      });
    });

    it("status を省略すると requested になる", async () => {
      const id = "00000000-0000-0000-0000-000000232402";
      const { error } = await clientAs(CLERK_A).from("returns").insert({
        id,
        order_id: ORDER_A_ID,
        requested_by_user_id: USER_A_ID,
        reason: "不良品",
      });
      expect(error).toBeNull();
      const { data } = await supabase
        .from("returns")
        .select("status")
        .eq("id", id)
        .single();
      expect(data?.status).toBe("requested");
    });

    it.each(["approved", "rejected", "received", "refunded", "cancelled"])(
      "status='%s' の申請はINSERTできない",
      async (status) => {
        const { error } = await clientAs(CLERK_A).from("returns").insert({
          id: REJECTED_ID,
          order_id: ORDER_A_ID,
          status,
          requested_by_user_id: USER_A_ID,
          reason: "不良品",
        });
        expect(error?.message).toMatch(/row-level security/);
        expect(await returnExists(REJECTED_ID)).toBe(false);
      }
    );

    it.each<[string, Partial<ReturnsInsert>]>([
      [
        "stripe_refund_id",
        { stripe_refund_id: "re_test_returns_schema_member" },
      ],
      ["refund_amount", { refund_amount: 10_000 }],
      [
        "reviewed_by_admin_user_id",
        { reviewed_by_admin_user_id: ADMIN_USER_ID },
      ],
      ["created_by_admin_user_id", { created_by_admin_user_id: ADMIN_USER_ID }],
      ["admin_note", { admin_note: "会員が書いたメモ" }],
      ["approved_at", { approved_at: new Date().toISOString() }],
      ["received_at", { received_at: new Date().toISOString() }],
      ["refunded_at", { refunded_at: new Date().toISOString() }],
    ])(
      "運営が記録する項目（%s）を入れた申請はINSERTできない",
      async (_column, adminFields) => {
        const { error } = await clientAs(CLERK_A)
          .from("returns")
          .insert({
            id: REJECTED_ID,
            order_id: ORDER_A_ID,
            requested_by_user_id: USER_A_ID,
            reason: "不良品",
            ...adminFields,
          });
        expect(error?.message).toMatch(/permission denied/);
        expect(await returnExists(REJECTED_ID)).toBe(false);
      }
    );

    it("他の会員の注文への申請はINSERTできない", async () => {
      const { error } = await clientAs(CLERK_A).from("returns").insert({
        id: REJECTED_ID,
        order_id: ORDER_B_ID,
        requested_by_user_id: USER_A_ID,
        reason: "不良品",
      });
      expect(error?.message).toMatch(/row-level security/);
      expect(await returnExists(REJECTED_ID)).toBe(false);
    });

    it("他の会員を申請者にした申請はINSERTできない", async () => {
      const { error } = await clientAs(CLERK_A).from("returns").insert({
        id: REJECTED_ID,
        order_id: ORDER_A_ID,
        requested_by_user_id: USER_B_ID,
        reason: "不良品",
      });
      expect(error?.message).toMatch(/row-level security/);
      expect(await returnExists(REJECTED_ID)).toBe(false);
    });

    it("申請と別の注文の明細を指す明細はINSERTできない", async () => {
      const { error } = await clientAs(CLERK_A).from("return_items").insert({
        id: REJECTED_ID,
        return_id: RETURN_A_ID,
        order_item_id: ITEM_A2_OTHER_ORDER_ID,
        quantity: 1,
      });
      expect(error?.message).toMatch(/row-level security/);
      expect(await returnItemExists(REJECTED_ID)).toBe(false);
    });

    it("他の会員の申請・注文明細を指す明細はINSERTできない", async () => {
      const member = clientAs(CLERK_A);
      const { error: otherReturn } = await member.from("return_items").insert({
        id: REJECTED_ID,
        return_id: RETURN_B_ID,
        order_item_id: ITEM_B_ID,
        quantity: 1,
      });
      expect(otherReturn?.message).toMatch(/row-level security/);

      const { error: otherItem } = await member.from("return_items").insert({
        id: REJECTED_ID,
        return_id: RETURN_A_ID,
        order_item_id: ITEM_B_ID,
        quantity: 1,
      });
      expect(otherItem?.message).toMatch(/row-level security/);
      expect(await returnItemExists(REJECTED_ID)).toBe(false);
    });

    it("requested でなくなった申請には明細を追加できない", async () => {
      const { error } = await clientAs(CLERK_A).from("return_items").insert({
        id: REJECTED_ID,
        return_id: RETURN_A_APPROVED_ID,
        order_item_id: ITEM_A1_ID,
        quantity: 1,
      });
      expect(error?.message).toMatch(/row-level security/);
      expect(await returnItemExists(REJECTED_ID)).toBe(false);
    });

    it("返金額を入れた明細はINSERTできない", async () => {
      const { error } = await clientAs(CLERK_A).from("return_items").insert({
        id: REJECTED_ID,
        return_id: RETURN_A_ID,
        order_item_id: ITEM_A2_ID,
        quantity: 1,
        refund_amount: 10_000,
      });
      expect(error?.message).toMatch(/permission denied/);
      expect(await returnItemExists(REJECTED_ID)).toBe(false);
    });
  });

  describe("RLS: 会員からの更新・削除", () => {
    it("会員は自分の申請でもUPDATEできない", async () => {
      const { error } = await clientAs(CLERK_A)
        .from("returns")
        .update({ status: "approved" })
        .eq("id", RETURN_A_ID);
      expect(error?.message).toMatch(/permission denied/);

      const { data } = await supabase
        .from("returns")
        .select("status")
        .eq("id", RETURN_A_ID)
        .single();
      expect(data?.status).toBe("requested");
    });

    it("会員は自分の申請の明細でもUPDATEできない", async () => {
      const { error } = await clientAs(CLERK_A)
        .from("return_items")
        .update({ quantity: 3 })
        .eq("id", RETURN_ITEM_A_ID);
      expect(error?.message).toMatch(/permission denied/);

      const { data } = await supabase
        .from("return_items")
        .select("quantity")
        .eq("id", RETURN_ITEM_A_ID)
        .single();
      expect(data?.quantity).toBe(1);
    });

    it("会員は自分の申請・明細でもDELETEできない", async () => {
      const member = clientAs(CLERK_A);
      const { error: itemError } = await member
        .from("return_items")
        .delete()
        .eq("id", RETURN_ITEM_A_ID);
      expect(itemError?.message).toMatch(/permission denied/);
      const { error } = await member
        .from("returns")
        .delete()
        .eq("id", RETURN_A_ID);
      expect(error?.message).toMatch(/permission denied/);

      expect(await returnItemExists(RETURN_ITEM_A_ID)).toBe(true);
      expect(await returnExists(RETURN_A_ID)).toBe(true);
    });
  });
});
