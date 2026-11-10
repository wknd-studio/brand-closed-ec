import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";

// #621 会員のトークン（authenticated）で、PostgREST から自分の users 行を直接書き換えられないこと。
// アプリの users への書き込みはすべて admin クライアントで行うため、会員が書いてよい列は無い。

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
const adminClient = createClient<Database>(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_ID = "00000000-0000-0000-0000-000000621a01";
const CLERK_USER = "clerk_test_users_member_update_rls";

const memberClient = createClient<Database>(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${signTestJwt(CLERK_USER)}` } },
  }
);

type UserUpdate = Database["public"]["Tables"]["users"]["Update"];

const ORIGINAL = {
  id: USER_ID,
  clerk_user_id: CLERK_USER,
  email: `${CLERK_USER}@example.com`,
  first_name: "テスト",
  last_name: "太郎",
  rank_code: "starter",
  onboarding_completed: false,
  stripe_customer_id: null,
  initial_fee_paid_rank_code: null,
  billing_anchor_day: null,
  member_type: "individual",
} satisfies Database["public"]["Tables"]["users"]["Insert"];

async function cleanup() {
  await adminClient.from("users").delete().eq("id", USER_ID);
}

async function readRow() {
  const { data, error } = await adminClient
    .from("users")
    .select("*")
    .eq("id", USER_ID)
    .single();
  if (error) throw error;
  return data;
}

beforeAll(async () => {
  await cleanup();
  const { error } = await adminClient.from("users").insert(ORIGINAL);
  if (error) throw error;
});

// 前のテストで書き換わっていても（deleted_at が入ると自分の行が見えなくなる等）、各テストを同じ状態から始める
beforeEach(async () => {
  const { error } = await adminClient
    .from("users")
    .update({ ...ORIGINAL, deleted_at: null })
    .eq("id", USER_ID);
  if (error) throw error;
});

afterAll(cleanup);

describe("users: 会員のトークンでの UPDATE", () => {
  it("自分の行は読める", async () => {
    const { data, error } = await memberClient
      .from("users")
      .select("id, rank_code")
      .eq("id", USER_ID);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: USER_ID, rank_code: "starter" }]);
  });

  it.each<[string, UserUpdate]>([
    ["rank_code", { rank_code: "enterprise" }],
    ["onboarding_completed", { onboarding_completed: true }],
    ["stripe_customer_id", { stripe_customer_id: "cus_test_forged" }],
    ["initial_fee_paid_rank_code", { initial_fee_paid_rank_code: "premium" }],
    ["billing_anchor_day", { billing_anchor_day: 15 }],
    ["deleted_at", { deleted_at: new Date().toISOString() }],
    ["first_name", { first_name: "改ざん" }],
  ])("自分の行の %s を書き換えられない", async (_column, update) => {
    const before = await readRow();

    const { data } = await memberClient
      .from("users")
      .update(update)
      .eq("id", USER_ID)
      .select("id");

    expect(data ?? []).toEqual([]);
    expect(await readRow()).toEqual(before);
  });
});
