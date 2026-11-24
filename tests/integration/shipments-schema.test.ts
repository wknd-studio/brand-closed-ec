import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";
import { randomOrderNumber } from "../helpers/order-number";

// shipments（#355）: 注文（orders）と実際に発送する箱（shipments）を分け、揃った明細から
// 先に出荷できるようにする。業務ルールの正は docs/domain/fulfillment.md。
// 会員は自分の注文に紐づく出荷の参照だけができ、書き込みは管理画面API（service role）に一本化する

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
const anon = createClient<Database>(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

const USER_A_ID = "00000000-0000-0000-0000-0000003550a1";
const USER_B_ID = "00000000-0000-0000-0000-0000003550b1";
const CLERK_A = "clerk_test_shipments_schema_a";
const CLERK_B = "clerk_test_shipments_schema_b";
const ADMIN_USER_ID = "00000000-0000-0000-0000-0000003550f1";

const ORDER_A_ID = "00000000-0000-0000-0000-000000355001";
const ORDER_B_ID = "00000000-0000-0000-0000-000000355002";
const ALL_ORDER_IDS = [ORDER_A_ID, ORDER_B_ID];
const ITEM_A1_ID = "00000000-0000-0000-0000-000000355101";
const ITEM_A2_ID = "00000000-0000-0000-0000-000000355102";
const ITEM_B_ID = "00000000-0000-0000-0000-000000355103";

// service role で用意する出荷（会員Aの発送済み・会員Bの未着手）
const SHIPMENT_A_ID = "00000000-0000-0000-0000-000000355201";
const SHIPMENT_B_ID = "00000000-0000-0000-0000-000000355202";
// 制約・会員のINSERTで使う出荷のID（拒否されたら行が無いことを確かめる）
const REJECTED_ID = "00000000-0000-0000-0000-000000355299";
const NONEXISTENT_ID = "00000000-0000-0000-0000-000000355999";

// 会員が読める列（運営者のID assigned_admin_user_id を除く全列）
const MEMBER_COLUMNS =
  "id, order_id, status, carrier, tracking_number, shipped_at, delivered_at, origin_location_code, created_at";

const baseOrder = {
  shipping_address_snapshot: {},
  billing_address_snapshot: {},
  rank_at_order: "basic" as const,
  monthly_limit_at_order: 1_000_000,
  status: "paid",
};

const baseItem = {
  sanity_product_id: "prod-355",
  product_name_snapshot: "テスト商品",
  unit_price_snapshot: 10_000,
  quantity: 1,
  payment_timing: "at_order",
};

async function cleanup() {
  // order_items.shipment_id → shipments の外部キーがあるため、明細を先に消す
  await supabase.from("order_items").delete().in("order_id", ALL_ORDER_IDS);
  await supabase.from("shipments").delete().in("order_id", ALL_ORDER_IDS);
  await supabase.from("orders").delete().in("id", ALL_ORDER_IDS);
  await supabase.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
  await supabase.from("admin_users").delete().eq("id", ADMIN_USER_ID);
}

async function shipmentExists(id: string) {
  const { data, error } = await supabase
    .from("shipments")
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
    clerk_user_id: "clerk_test_shipments_schema_admin",
    name: "運営 太郎",
    email: "shipments-schema-admin@example.com",
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
      id: ORDER_B_ID,
      user_id: USER_B_ID,
    },
  ]);
  if (ordersError) throw ordersError;

  // 一括INSERTだと、片方の行にしか無い列（status 等）がもう片方でNULLになり既定値が
  // 効かないため、既定値を確かめる会員Bの出荷は別にINSERTする
  const { error: shipmentsError } = await supabase.from("shipments").insert([
    {
      id: SHIPMENT_A_ID,
      order_id: ORDER_A_ID,
      status: "shipped",
      assigned_admin_user_id: ADMIN_USER_ID,
      carrier: "ヤマト運輸",
      tracking_number: "1234-5678-9012",
      shipped_at: new Date().toISOString(),
      origin_location_code: "office",
    },
  ]);
  if (shipmentsError) throw shipmentsError;
  const { error: shipmentBError } = await supabase.from("shipments").insert({
    id: SHIPMENT_B_ID,
    order_id: ORDER_B_ID,
    origin_location_code: "supplier_direct",
  });
  if (shipmentBError) throw shipmentBError;

  const { error: itemsError } = await supabase.from("order_items").insert([
    {
      ...baseItem,
      id: ITEM_A1_ID,
      order_id: ORDER_A_ID,
      shipment_id: SHIPMENT_A_ID,
    },
    { ...baseItem, id: ITEM_A2_ID, order_id: ORDER_A_ID },
    {
      ...baseItem,
      id: ITEM_B_ID,
      order_id: ORDER_B_ID,
      shipment_id: SHIPMENT_B_ID,
    },
  ]);
  if (itemsError) throw itemsError;
});

afterAll(async () => {
  await cleanup();
});

describe("shipments", () => {
  describe("制約", () => {
    it("status を省略すると pending になり、assigned_admin_user_id 等はNULLのまま", async () => {
      const { data, error } = await supabase
        .from("shipments")
        .select(
          "status, assigned_admin_user_id, carrier, tracking_number, shipped_at, delivered_at, created_at"
        )
        .eq("id", SHIPMENT_B_ID)
        .single();
      expect(error).toBeNull();
      expect(data).toMatchObject({
        status: "pending",
        assigned_admin_user_id: null,
        carrier: null,
        tracking_number: null,
        shipped_at: null,
        delivered_at: null,
      });
      expect(data?.created_at).toBeTruthy();
    });

    it("4値の status はすべて入れられる", async () => {
      const statuses = ["pending", "preparing", "shipped", "delivered"];
      const ids = statuses.map(
        (_, i) => `00000000-0000-0000-0000-00000035530${i}`
      );
      const { error } = await supabase.from("shipments").insert(
        statuses.map((status, i) => ({
          id: ids[i],
          order_id: ORDER_B_ID,
          status,
          origin_location_code: "office",
        }))
      );
      expect(error).toBeNull();
      await supabase.from("shipments").delete().in("id", ids);
    });

    it("status は4値以外を入れられない", async () => {
      const { error } = await supabase.from("shipments").insert({
        id: REJECTED_ID,
        order_id: ORDER_A_ID,
        status: "cancelled",
        origin_location_code: "office",
      });
      expect(error?.message).toMatch(/shipments_status_check/);
      expect(await shipmentExists(REJECTED_ID)).toBe(false);
    });

    it("存在しない拠点コードの出荷は作れない", async () => {
      const { error } = await supabase.from("shipments").insert({
        id: REJECTED_ID,
        order_id: ORDER_A_ID,
        origin_location_code: "warehouse_nonexistent",
      });
      expect(error?.message).toMatch(/shipments_origin_location_code_fkey/);
      expect(await shipmentExists(REJECTED_ID)).toBe(false);
    });

    it("拠点コードの無い出荷は作れない", async () => {
      const { error } = await supabase
        .from("shipments")
        // @ts-expect-error origin_location_code は NOT NULL のため Insert 型でも必須
        .insert({ id: REJECTED_ID, order_id: ORDER_A_ID });
      expect(error?.code).toBe("23502");
      expect(await shipmentExists(REJECTED_ID)).toBe(false);
    });

    it("存在しない注文の出荷は作れない", async () => {
      const { error } = await supabase.from("shipments").insert({
        id: REJECTED_ID,
        order_id: NONEXISTENT_ID,
        origin_location_code: "office",
      });
      expect(error?.message).toMatch(/shipments_order_id_fkey/);
      expect(await shipmentExists(REJECTED_ID)).toBe(false);
    });

    it("存在しない運営者を担当者にできない", async () => {
      const { error } = await supabase
        .from("shipments")
        .update({ assigned_admin_user_id: NONEXISTENT_ID })
        .eq("id", SHIPMENT_B_ID);
      expect(error?.message).toMatch(/shipments_assigned_admin_user_id_fkey/);

      const { data } = await supabase
        .from("shipments")
        .select("assigned_admin_user_id")
        .eq("id", SHIPMENT_B_ID)
        .single();
      expect(data?.assigned_admin_user_id).toBeNull();
    });

    it("order_items.shipment_id は存在しない出荷を指せない", async () => {
      const { error } = await supabase
        .from("order_items")
        .update({ shipment_id: NONEXISTENT_ID })
        .eq("id", ITEM_A2_ID);
      expect(error?.message).toMatch(/order_items_shipment_id_fkey/);

      const { data } = await supabase
        .from("order_items")
        .select("shipment_id")
        .eq("id", ITEM_A2_ID)
        .single();
      expect(data?.shipment_id).toBeNull();
    });

    it("同じ注文の明細を別々の出荷に載せられ、未発送の明細は shipment_id がNULL", async () => {
      const { data, error } = await supabase
        .from("order_items")
        .select("id, shipment_id")
        .eq("order_id", ORDER_A_ID)
        .order("id");
      expect(error).toBeNull();
      expect(data).toEqual([
        { id: ITEM_A1_ID, shipment_id: SHIPMENT_A_ID },
        { id: ITEM_A2_ID, shipment_id: null },
      ]);
    });
  });

  describe("RLS: 参照", () => {
    it("会員は自分の注文に紐づく出荷だけを参照できる", async () => {
      const { data, error } = await clientAs(CLERK_A)
        .from("shipments")
        .select(MEMBER_COLUMNS)
        .in("id", [SHIPMENT_A_ID, SHIPMENT_B_ID]);
      expect(error).toBeNull();
      expect(data).toEqual([
        expect.objectContaining({
          id: SHIPMENT_A_ID,
          order_id: ORDER_A_ID,
          status: "shipped",
          carrier: "ヤマト運輸",
          tracking_number: "1234-5678-9012",
          origin_location_code: "office",
        }),
      ]);
    });

    it("別の会員からは、もう一方の会員の出荷だけが見える", async () => {
      const { data, error } = await clientAs(CLERK_B)
        .from("shipments")
        .select("id")
        .in("id", [SHIPMENT_A_ID, SHIPMENT_B_ID]);
      expect(error).toBeNull();
      expect(data?.map((s) => s.id)).toEqual([SHIPMENT_B_ID]);
    });

    it("会員は自分の明細がどの出荷に載ったかを参照できる", async () => {
      const { data, error } = await clientAs(CLERK_A)
        .from("order_items")
        .select("id, shipment_id")
        .eq("order_id", ORDER_A_ID)
        .order("id");
      expect(error).toBeNull();
      expect(data).toEqual([
        { id: ITEM_A1_ID, shipment_id: SHIPMENT_A_ID },
        { id: ITEM_A2_ID, shipment_id: null },
      ]);
    });

    it("未ログインでは出荷を参照できない", async () => {
      const { data } = await anon
        .from("shipments")
        .select("id")
        .in("id", [SHIPMENT_A_ID, SHIPMENT_B_ID]);
      expect(data ?? []).toEqual([]);
    });

    it("会員は自分の出荷でも担当した運営者のID（assigned_admin_user_id）を読めない", async () => {
      const { data, error } = await clientAs(CLERK_A)
        .from("shipments")
        .select("assigned_admin_user_id")
        .eq("id", SHIPMENT_A_ID);
      expect(error?.message).toMatch(/permission denied/);
      expect(data).toBeNull();
    });
  });

  describe("RLS: 会員からの書き込み", () => {
    it("会員は自分の注文にも出荷をINSERTできない", async () => {
      const { error } = await clientAs(CLERK_A).from("shipments").insert({
        id: REJECTED_ID,
        order_id: ORDER_A_ID,
        origin_location_code: "office",
      });
      expect(error).not.toBeNull();
      expect(await shipmentExists(REJECTED_ID)).toBe(false);
    });

    it("会員は自分の出荷でもUPDATEできない", async () => {
      const { error } = await clientAs(CLERK_A)
        .from("shipments")
        .update({ status: "delivered" })
        .eq("id", SHIPMENT_A_ID);
      expect(error).not.toBeNull();

      const { data } = await supabase
        .from("shipments")
        .select("status")
        .eq("id", SHIPMENT_A_ID)
        .single();
      expect(data?.status).toBe("shipped");
    });

    it("会員は自分の出荷でもDELETEできない", async () => {
      const { error } = await clientAs(CLERK_A)
        .from("shipments")
        .delete()
        .eq("id", SHIPMENT_A_ID);
      expect(error).not.toBeNull();
      expect(await shipmentExists(SHIPMENT_A_ID)).toBe(true);
    });

    it("未ログインでは出荷をINSERTできない", async () => {
      const { error } = await anon.from("shipments").insert({
        id: REJECTED_ID,
        order_id: ORDER_A_ID,
        origin_location_code: "office",
      });
      expect(error).not.toBeNull();
      expect(await shipmentExists(REJECTED_ID)).toBe(false);
    });
  });
});
