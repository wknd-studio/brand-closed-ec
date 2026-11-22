import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";

// docs/db-schema-redesign.md「locations」節・移行方針ステップ13（GitHub issue #354）
// locations新設・order_items.fulfillment_location_code追加を検証する統合テスト。

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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const adminClient = createClient<Database>(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
const anonClient = createClient<Database>(supabaseUrl, anonKey, {
  auth: { persistSession: false },
});

const USER_ID = "00000000-0000-0000-0000-000000354a01";
const CLERK_USER_ID = "clerk_test_locations_schema";

const memberClient = createClient<Database>(supabaseUrl, anonKey, {
  auth: { persistSession: false },
  global: {
    headers: { Authorization: `Bearer ${signTestJwt(CLERK_USER_ID)}` },
  },
});

const baseItem = {
  sanity_product_id: "product-1",
  product_name_snapshot: "テスト商品",
  unit_price_snapshot: 1000,
  quantity: 1,
  payment_timing: "at_order" as const,
};

async function createOrder(): Promise<string> {
  const { data, error } = await adminClient
    .from("orders")
    .insert({
      user_id: USER_ID,
      shipping_address_snapshot: {},
      billing_address_snapshot: {},
      rank_at_order: "starter",
      monthly_limit_at_order: 0,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

async function cleanup() {
  const { data: orders } = await adminClient
    .from("orders")
    .select("id")
    .eq("user_id", USER_ID);
  const orderIds = (orders ?? []).map((o) => o.id);
  if (orderIds.length > 0) {
    await adminClient.from("order_items").delete().in("order_id", orderIds);
    await adminClient.from("orders").delete().in("id", orderIds);
  }
  await adminClient.from("users").delete().eq("id", USER_ID);
}

beforeAll(async () => {
  await cleanup();
  const { error } = await adminClient.from("users").insert({
    id: USER_ID,
    clerk_user_id: CLERK_USER_ID,
    email: "locations-schema@example.com",
    first_name: "拠点",
    last_name: "テスト",
  });
  if (error) throw error;
});

afterAll(async () => {
  await cleanup();
});

describe("locations", () => {
  it("初期データとしてofficeとsupplier_directの2行が入っている", async () => {
    const { data, error } = await adminClient
      .from("locations")
      .select("code, name, requires_receiving")
      .order("code");
    expect(error).toBeNull();
    expect(data).toEqual([
      { code: "office", name: "事務所", requires_receiving: true },
      {
        code: "supplier_direct",
        name: "仕入れ先直送",
        requires_receiving: false,
      },
    ]);
  });

  it("住所・電話番号の列があり、初期データではNULLのまま", async () => {
    const { data, error } = await adminClient
      .from("locations")
      .select(
        "postal_code, prefecture, city, address_line1, address_line2, phone_number, created_at, updated_at"
      )
      .order("code");
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(row).toMatchObject({
        postal_code: null,
        prefecture: null,
        city: null,
        address_line1: null,
        address_line2: null,
        phone_number: null,
      });
      expect(row.created_at).not.toBeNull();
      expect(row.updated_at).not.toBeNull();
    }
  });

  it("updated_atはUPDATE時に自動更新される", async () => {
    const { data: before } = await adminClient
      .from("locations")
      .select("updated_at, phone_number")
      .eq("code", "office")
      .single();

    await new Promise((resolve) => setTimeout(resolve, 10));
    await adminClient
      .from("locations")
      .update({ phone_number: "03-0000-0000" })
      .eq("code", "office");
    const { data: after } = await adminClient
      .from("locations")
      .select("updated_at")
      .eq("code", "office")
      .single();
    // 他のテストに影響しないよう元に戻す
    await adminClient
      .from("locations")
      .update({ phone_number: before!.phone_number })
      .eq("code", "office");

    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime()
    );
  });

  it("会員（authenticated）からはSELECTできない", async () => {
    const { data } = await memberClient.from("locations").select("*");
    // RLSで行が見えない（テーブルへの権限自体が無ければ data は null）
    expect(data ?? []).toEqual([]);
  });

  it("未ログイン（anon）からはSELECTできない", async () => {
    const { data } = await anonClient.from("locations").select("*");
    expect(data ?? []).toEqual([]);
  });

  it("会員（authenticated）からはINSERTできない", async () => {
    const { error } = await memberClient.from("locations").insert({
      code: "member_inserted",
      name: "x",
      requires_receiving: false,
    });
    expect(error).not.toBeNull();
    const { data } = await adminClient
      .from("locations")
      .select("code")
      .eq("code", "member_inserted");
    expect(data).toEqual([]);
  });
});

describe("order_items.fulfillment_location_code", () => {
  it("省略するとofficeになる（#357で明示的に入れるまでの暫定の既定値）", async () => {
    const orderId = await createOrder();
    const { data, error } = await adminClient
      .from("order_items")
      .insert({ ...baseItem, order_id: orderId })
      .select("fulfillment_location_code")
      .single();
    expect(error).toBeNull();
    expect(data?.fulfillment_location_code).toBe("office");
  });

  it("supplier_directを設定できる", async () => {
    const orderId = await createOrder();
    const { data, error } = await adminClient
      .from("order_items")
      .insert({
        ...baseItem,
        order_id: orderId,
        fulfillment_location_code: "supplier_direct",
      })
      .select("fulfillment_location_code")
      .single();
    expect(error).toBeNull();
    expect(data?.fulfillment_location_code).toBe("supplier_direct");
  });

  it("存在しないコードはFK違反で拒否される", async () => {
    const orderId = await createOrder();
    const { error } = await adminClient.from("order_items").insert({
      ...baseItem,
      order_id: orderId,
      fulfillment_location_code: "no_such_location",
    });
    expect(error?.code).toBe("23503");
  });

  it("NULLは拒否される", async () => {
    const orderId = await createOrder();
    const { error } = await adminClient.from("order_items").insert({
      ...baseItem,
      order_id: orderId,
      // NOT NULL 制約の確認のため、型を外して NULL を渡す
      fulfillment_location_code: null as unknown as string,
    });
    expect(error?.code).toBe("23502");
  });
});
