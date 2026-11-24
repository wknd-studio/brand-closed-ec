import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";

// orders.order_number（#754）: 画面に出すたびに注文ID（UUID）の先頭8文字から作っていた注文番号を、
// 重ならない保証のある列として保存する。形は Crockford Base32 の8文字（ハイフン無し）で、
// 注文を作るどの経路（DB関数・直接の insert）でも、指定しなければ DB が自動で入れる

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

const ORDER_NUMBER_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;

const USER_A_ID = "00000000-0000-0000-0000-0000007540a1";
const USER_B_ID = "00000000-0000-0000-0000-0000007540b1";
const CLERK_A = "clerk_test_order_number_a";
const CLERK_B = "clerk_test_order_number_b";

// 直接の insert で作る注文
const ORDER_A_ID = "00000000-0000-0000-0000-000000754001";
const ORDER_B_ID = "00000000-0000-0000-0000-000000754002";
// DB関数で作る注文
const ORDER_PLACED_ID = "00000000-0000-0000-0000-000000754011";
const ORDER_SAVED_ID = "00000000-0000-0000-0000-000000754012";
// 番号を指定する・制約で拒否される注文
const ORDER_EXPLICIT_ID = "00000000-0000-0000-0000-000000754021";
const ORDER_REJECTED_ID = "00000000-0000-0000-0000-000000754022";
const ALL_ORDER_IDS = [
  ORDER_A_ID,
  ORDER_B_ID,
  ORDER_PLACED_ID,
  ORDER_SAVED_ID,
  ORDER_EXPLICIT_ID,
  ORDER_REJECTED_ID,
];

const baseOrder = {
  shipping_address_snapshot: {},
  billing_address_snapshot: {},
  rank_at_order: "basic" as const,
  monthly_limit_at_order: 1_000_000,
  status: "paid",
};

async function cleanup() {
  await supabase
    .from("order_status_changes")
    .delete()
    .in("order_id", ALL_ORDER_IDS);
  await supabase.from("order_items").delete().in("order_id", ALL_ORDER_IDS);
  await supabase
    .from("order_settlements")
    .delete()
    .in("order_id", ALL_ORDER_IDS);
  await supabase.from("orders").delete().in("id", ALL_ORDER_IDS);
  await supabase.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
}

async function orderNumberOf(orderId: string) {
  const { data, error } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", orderId)
    .single();
  if (error) throw error;
  return data.order_number;
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

  const { error } = await supabase.from("orders").insert([
    { ...baseOrder, id: ORDER_A_ID, user_id: USER_A_ID },
    { ...baseOrder, id: ORDER_B_ID, user_id: USER_B_ID },
  ]);
  if (error) throw error;
});

afterAll(cleanup);

describe("orders.order_number の自動採番", () => {
  it("直接の insert で番号を指定しなければ、Crockford Base32 の8文字が入る", async () => {
    expect(await orderNumberOf(ORDER_A_ID)).toMatch(ORDER_NUMBER_PATTERN);
    expect(await orderNumberOf(ORDER_B_ID)).toMatch(ORDER_NUMBER_PATTERN);
    expect(await orderNumberOf(ORDER_A_ID)).not.toBe(
      await orderNumberOf(ORDER_B_ID)
    );
  });

  it("place_order_with_limit_check で作った注文にも番号が入る", async () => {
    const { error } = await supabase.rpc("place_order_with_limit_check", {
      p_user_id: USER_A_ID,
      p_period_start: new Date(2026, 10, 10).toISOString(),
      p_period_end: new Date(2026, 11, 10).toISOString(),
      p_monthly_limit: null as unknown as number,
      p_cart_fixed_total: 0,
      p_order: {
        ...baseOrder,
        id: ORDER_PLACED_ID,
        user_id: USER_A_ID,
        created_at: new Date().toISOString(),
      },
      p_items: [],
      p_settlement: null as unknown as Record<string, never>,
    });
    if (error) throw error;

    expect(await orderNumberOf(ORDER_PLACED_ID)).toMatch(ORDER_NUMBER_PATTERN);
  });

  it("save_order で作った注文にも番号が入り、保存し直しても番号は変わらない", async () => {
    const order = {
      ...baseOrder,
      id: ORDER_SAVED_ID,
      user_id: USER_A_ID,
      created_at: new Date().toISOString(),
    };
    const { error } = await supabase.rpc("save_order", {
      p_order: { ...order, version: 0 },
      p_settlements: [],
      p_items: [],
      p_status_change: { changed_by: "system" },
    });
    if (error) throw error;
    const first = await orderNumberOf(ORDER_SAVED_ID);
    expect(first).toMatch(ORDER_NUMBER_PATTERN);

    const { error: resaveError } = await supabase.rpc("save_order", {
      p_order: { ...order, status: "processing", version: 1 },
      p_settlements: [],
      p_items: [],
      p_status_change: { changed_by: "system" },
    });
    if (resaveError) throw resaveError;
    expect(await orderNumberOf(ORDER_SAVED_ID)).toBe(first);
  });

  it("自動で作った番号が既存の注文と重なれば、作り直して重ならない番号を返す", async () => {
    // 乱数は重なりを起こせないため、試す候補を先に渡して重なりを人工的に起こす
    const taken = await orderNumberOf(ORDER_A_ID);
    const { data, error } = await supabase.rpc("generate_order_number", {
      p_candidates: [taken, taken],
    });
    if (error) throw error;

    expect(data).toMatch(ORDER_NUMBER_PATTERN);
    expect(data).not.toBe(taken);
  });

  it("重なった候補を飛ばし、次の重ならない候補を使う", async () => {
    const taken = await orderNumberOf(ORDER_A_ID);
    const free = taken === "ZZZZZZZZ" ? "00000000" : "ZZZZZZZZ";
    const { data, error } = await supabase.rpc("generate_order_number", {
      p_candidates: [taken, free],
    });
    if (error) throw error;

    expect(data).toBe(free);
  });
});

describe("orders.order_number の制約", () => {
  it("指定した番号はそのまま入る", async () => {
    const { error } = await supabase.from("orders").insert({
      ...baseOrder,
      id: ORDER_EXPLICIT_ID,
      user_id: USER_A_ID,
      order_number: "K7Q2M9XD",
    });
    if (error) throw error;

    expect(await orderNumberOf(ORDER_EXPLICIT_ID)).toBe("K7Q2M9XD");
  });

  it("既存の注文と同じ番号は UNIQUE 制約で入れられない", async () => {
    const { error } = await supabase.from("orders").insert({
      ...baseOrder,
      id: ORDER_REJECTED_ID,
      user_id: USER_A_ID,
      order_number: await orderNumberOf(ORDER_A_ID),
    });

    expect(error?.code).toBe("23505");
  });

  it.each([
    ["小文字", "k7q2m9xd"],
    ["Crockford Base32 に無い文字（I・L・O・U）", "K7Q2M9XI"],
    ["ハイフン付き", "K7Q2-M9XD"],
    ["7文字", "K7Q2M9X"],
    ["9文字", "K7Q2M9XDA"],
  ])("形の違う番号（%s）は CHECK 制約で入れられない", async (_, value) => {
    const { error } = await supabase.from("orders").insert({
      ...baseOrder,
      id: ORDER_REJECTED_ID,
      user_id: USER_A_ID,
      order_number: value,
    });

    expect(error?.code).toBe("23514");
  });

  it("番号に NULL は入れられない", async () => {
    const { error } = await supabase.from("orders").insert({
      ...baseOrder,
      id: ORDER_REJECTED_ID,
      user_id: USER_A_ID,
      order_number: null as unknown as string,
    });

    expect(error?.code).toBe("23502");
  });
});

describe("orders.order_number の RLS", () => {
  it("会員は自分の注文の番号だけを読める", async () => {
    const { data, error } = await clientAs(CLERK_A)
      .from("orders")
      .select("id, order_number")
      .in("id", [ORDER_A_ID, ORDER_B_ID]);
    if (error) throw error;

    expect(data).toEqual([
      { id: ORDER_A_ID, order_number: await orderNumberOf(ORDER_A_ID) },
    ]);
  });

  it("会員のトークンからは番号を作る関数を呼べない", async () => {
    const { error } = await clientAs(CLERK_A).rpc("generate_order_number", {});

    expect(error?.message).toMatch(
      /permission denied for function generate_order_number/
    );
  });
});
