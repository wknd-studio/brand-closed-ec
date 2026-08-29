import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";

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
const adminClient = createClient<Database>(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

function clientAs(claims: Record<string, unknown>) {
  return createClient<Database>(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${signTestJwt(claims)}` } },
  });
}

const ORG_A_ID = "00000000-0000-0000-0000-0000000000a1";
const ORG_B_ID = "00000000-0000-0000-0000-0000000000b1";
const USER_A_ID = "00000000-0000-0000-0000-0000000000a2";
const USER_B_ID = "00000000-0000-0000-0000-0000000000b2";
const ADDRESS_A_ID = "00000000-0000-0000-0000-0000000000a3";
const ADDRESS_B_ID = "00000000-0000-0000-0000-0000000000b3";
const ORDER_A_ID = "00000000-0000-0000-0000-0000000000a4";
const ORDER_B_ID = "00000000-0000-0000-0000-0000000000b4";
const CLERK_ORG_A = "org_test_rls_a";
const CLERK_ORG_B = "org_test_rls_b";
const CLERK_USER_A = "clerk_test_rls_a";
const CLERK_USER_B = "clerk_test_rls_b";

beforeAll(async () => {
  await adminClient
    .from("addresses")
    .delete()
    .in("id", [ADDRESS_A_ID, ADDRESS_B_ID]);
  await adminClient.from("orders").delete().in("id", [ORDER_A_ID, ORDER_B_ID]);
  await adminClient
    .from("organization_memberships")
    .delete()
    .in("organization_id", [ORG_A_ID, ORG_B_ID]);
  await adminClient.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
  await adminClient
    .from("organizations")
    .delete()
    .in("id", [ORG_A_ID, ORG_B_ID]);

  await adminClient.from("organizations").insert([
    {
      id: ORG_A_ID,
      clerk_org_id: CLERK_ORG_A,
      name: "組織A",
      representative_name: "代表A",
      phone_number: "0300000001",
      invoice_registration_number: "T1000000000001",
    },
    {
      id: ORG_B_ID,
      clerk_org_id: CLERK_ORG_B,
      name: "組織B",
      representative_name: "代表B",
      phone_number: "0300000002",
      invoice_registration_number: "T1000000000002",
    },
  ]);

  await adminClient.from("users").insert([
    {
      id: USER_A_ID,
      clerk_user_id: CLERK_USER_A,
      email: "rls-a@example.com",
      first_name: "エー",
      last_name: "テスト",
    },
    {
      id: USER_B_ID,
      clerk_user_id: CLERK_USER_B,
      email: "rls-b@example.com",
      first_name: "ビー",
      last_name: "テスト",
    },
  ]);

  await adminClient.from("organization_memberships").insert([
    {
      organization_id: ORG_A_ID,
      user_id: USER_A_ID,
      clerk_role: "org:admin",
    },
    {
      organization_id: ORG_B_ID,
      user_id: USER_B_ID,
      clerk_role: "org:admin",
    },
  ]);

  await adminClient.from("addresses").insert([
    {
      id: ADDRESS_A_ID,
      user_id: USER_A_ID,
      organization_id: ORG_A_ID,
      type: "shipping",
      recipient_last_name: "テスト",
      recipient_first_name: "エー",
      postal_code: "1000001",
      prefecture: "東京都",
      city: "千代田区",
      address_line1: "1-1-1",
      phone_number: "0300000001",
    },
    {
      id: ADDRESS_B_ID,
      user_id: USER_B_ID,
      organization_id: ORG_B_ID,
      type: "shipping",
      recipient_last_name: "テスト",
      recipient_first_name: "ビー",
      postal_code: "1000002",
      prefecture: "東京都",
      city: "千代田区",
      address_line1: "2-2-2",
      phone_number: "0300000002",
    },
  ]);

  await adminClient.from("orders").insert([
    {
      id: ORDER_A_ID,
      user_id: USER_A_ID,
      organization_id: ORG_A_ID,
      payment_flow: "checkout",
      shipping_address_snapshot: {},
      billing_address_snapshot: {},
      rank_at_order: "standard",
      monthly_limit_at_order: 5_000_000,
    },
    {
      id: ORDER_B_ID,
      user_id: USER_B_ID,
      organization_id: ORG_B_ID,
      payment_flow: "checkout",
      shipping_address_snapshot: {},
      billing_address_snapshot: {},
      rank_at_order: "standard",
      monthly_limit_at_order: 5_000_000,
    },
  ]);
});

afterAll(async () => {
  await adminClient
    .from("addresses")
    .delete()
    .in("id", [ADDRESS_A_ID, ADDRESS_B_ID]);
  await adminClient.from("orders").delete().in("id", [ORDER_A_ID, ORDER_B_ID]);
  await adminClient
    .from("organization_memberships")
    .delete()
    .in("organization_id", [ORG_A_ID, ORG_B_ID]);
  await adminClient.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
  await adminClient
    .from("organizations")
    .delete()
    .in("id", [ORG_A_ID, ORG_B_ID]);
});

describe("組織スコープのRLSアクセス制御（FR-014）", () => {
  it("組織Aのメンバーは組織Aのorganizationsレコードのみ参照できる", async () => {
    const asUserA = clientAs({ sub: CLERK_USER_A, org_id: CLERK_ORG_A });
    const { data } = await asUserA
      .from("organizations")
      .select("id")
      .in("id", [ORG_A_ID, ORG_B_ID]);
    expect((data ?? []).map((r) => r.id)).toEqual([ORG_A_ID]);
  });

  it("組織Aのメンバーは組織Bのorganization_membershipsを参照できない", async () => {
    const asUserA = clientAs({ sub: CLERK_USER_A, org_id: CLERK_ORG_A });
    const { data } = await asUserA
      .from("organization_memberships")
      .select("organization_id")
      .in("organization_id", [ORG_A_ID, ORG_B_ID]);
    expect((data ?? []).map((r) => r.organization_id)).toEqual([ORG_A_ID]);
  });

  it("組織Aのメンバーは組織Bのordersを参照できない", async () => {
    const asUserA = clientAs({ sub: CLERK_USER_A, org_id: CLERK_ORG_A });
    const { data } = await asUserA
      .from("orders")
      .select("id")
      .in("id", [ORDER_A_ID, ORDER_B_ID]);
    expect((data ?? []).map((r) => r.id)).toEqual([ORDER_A_ID]);
  });

  it("組織Aのメンバーは組織Bのaddressesを参照できない", async () => {
    const asUserA = clientAs({ sub: CLERK_USER_A, org_id: CLERK_ORG_A });
    const { data } = await asUserA
      .from("addresses")
      .select("id")
      .in("id", [ADDRESS_A_ID, ADDRESS_B_ID]);
    expect((data ?? []).map((r) => r.id)).toEqual([ADDRESS_A_ID]);
  });

  it("どの組織にも所属していないユーザーは組織データを一切参照できない", async () => {
    const asOutsider = clientAs({ sub: "clerk_test_rls_outsider" });
    const { data } = await asOutsider
      .from("organizations")
      .select("id")
      .in("id", [ORG_A_ID, ORG_B_ID]);
    expect(data ?? []).toEqual([]);
  });
});
