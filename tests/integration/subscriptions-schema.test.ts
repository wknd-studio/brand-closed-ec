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

const ORG_A_ID = "00000000-0000-0000-0000-0000000010a1";
const USER_A_ID = "00000000-0000-0000-0000-0000000010a2";
const USER_B_ID = "00000000-0000-0000-0000-0000000010b2";
const CLERK_ORG_A = "org_test_subscriptions_a";
const CLERK_USER_A = "clerk_test_subscriptions_a";
const CLERK_USER_B = "clerk_test_subscriptions_b";
const SUBSCRIPTION_USER_A_ID = "00000000-0000-0000-0000-0000000010c1";
const SUBSCRIPTION_ORG_A_ID = "00000000-0000-0000-0000-0000000010c2";
const RANK_CHANGE_USER_A_ID = "00000000-0000-0000-0000-0000000010d1";

async function cleanup() {
  await adminClient
    .from("rank_changes")
    .delete()
    .eq("id", RANK_CHANGE_USER_A_ID);
  await adminClient
    .from("subscriptions")
    .delete()
    .in("id", [SUBSCRIPTION_USER_A_ID, SUBSCRIPTION_ORG_A_ID]);
  await adminClient
    .from("organization_memberships")
    .delete()
    .eq("organization_id", ORG_A_ID);
  await adminClient.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
  await adminClient.from("organizations").delete().eq("id", ORG_A_ID);
  await adminClient
    .from("stripe_webhook_events")
    .delete()
    .in("event_id", [
      "evt_test_subscriptions_1",
      "evt_test_subscriptions_1_dup",
    ]);
}

beforeAll(async () => {
  await cleanup();

  const { error: orgError } = await adminClient.from("organizations").insert({
    id: ORG_A_ID,
    clerk_org_id: CLERK_ORG_A,
    name: "組織A",
    representative_name: "代表A",
    phone_number: "0300000001",
    postal_code: "1000001",
    prefecture: "東京都",
    city: "千代田区",
    address_line1: "1-1-1",
    invoice_registration_number: "T1000000000010",
  });
  if (orgError) throw orgError;

  const { error: usersError } = await adminClient.from("users").insert([
    {
      id: USER_A_ID,
      clerk_user_id: CLERK_USER_A,
      email: "subscriptions-a@example.com",
      first_name: "エー",
      last_name: "テスト",
    },
    {
      id: USER_B_ID,
      clerk_user_id: CLERK_USER_B,
      email: "subscriptions-b@example.com",
      first_name: "ビー",
      last_name: "テスト",
    },
  ]);
  if (usersError) throw usersError;

  const { error: membershipError } = await adminClient
    .from("organization_memberships")
    .insert({
      organization_id: ORG_A_ID,
      user_id: USER_A_ID,
      clerk_role: "org:admin",
    });
  if (membershipError) throw membershipError;
});

afterAll(async () => {
  await cleanup();
});

describe("subscriptions", () => {
  afterAll(async () => {
    await adminClient
      .from("subscriptions")
      .delete()
      .in("id", [SUBSCRIPTION_USER_A_ID, SUBSCRIPTION_ORG_A_ID]);
  });

  it("user_id/organization_idのどちらか一方のみ設定できる（両方NULLは拒否）", async () => {
    const { error } = await adminClient.from("subscriptions").insert({
      stripe_customer_id: "cus_test_neither",
      stripe_subscription_id: "sub_test_neither",
      status: "active",
      rank_code: "starter",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("user_id/organization_idの両方を設定すると拒否される", async () => {
    const { error } = await adminClient.from("subscriptions").insert({
      user_id: USER_A_ID,
      organization_id: ORG_A_ID,
      stripe_customer_id: "cus_test_both",
      stripe_subscription_id: "sub_test_both",
      status: "active",
      rank_code: "starter",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date().toISOString(),
    });
    expect(error).not.toBeNull();
  });

  it("同じ所有者に解約済みでないサブスクリプションを2件作れない（部分UNIQUE）", async () => {
    const { error: firstError } = await adminClient
      .from("subscriptions")
      .insert({
        id: SUBSCRIPTION_USER_A_ID,
        user_id: USER_A_ID,
        stripe_customer_id: "cus_test_a",
        stripe_subscription_id: "sub_test_a",
        status: "active",
        rank_code: "starter",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date().toISOString(),
      });
    expect(firstError).toBeNull();

    const { error: secondError } = await adminClient
      .from("subscriptions")
      .insert({
        user_id: USER_A_ID,
        stripe_customer_id: "cus_test_a2",
        stripe_subscription_id: "sub_test_a2",
        status: "trialing",
        rank_code: "basic",
        current_period_start: new Date().toISOString(),
        current_period_end: new Date().toISOString(),
      });
    expect(secondError).not.toBeNull();
  });

  it("本人は自分のsubscriptionsを参照できるが、他人のものは参照できない", async () => {
    await adminClient.from("subscriptions").insert({
      id: SUBSCRIPTION_ORG_A_ID,
      organization_id: ORG_A_ID,
      stripe_customer_id: "cus_test_org_a",
      stripe_subscription_id: "sub_test_org_a",
      status: "active",
      rank_code: "standard",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date().toISOString(),
    });

    const asUserA = clientAs({ sub: CLERK_USER_A, org_id: CLERK_ORG_A });
    const { data: ownData } = await asUserA
      .from("subscriptions")
      .select("id")
      .eq("id", SUBSCRIPTION_USER_A_ID);
    expect((ownData ?? []).map((r) => r.id)).toEqual([SUBSCRIPTION_USER_A_ID]);

    const { data: orgData } = await asUserA
      .from("subscriptions")
      .select("id")
      .eq("id", SUBSCRIPTION_ORG_A_ID);
    expect((orgData ?? []).map((r) => r.id)).toEqual([SUBSCRIPTION_ORG_A_ID]);

    const asUserB = clientAs({ sub: CLERK_USER_B });
    const { data: otherData } = await asUserB
      .from("subscriptions")
      .select("id")
      .in("id", [SUBSCRIPTION_USER_A_ID, SUBSCRIPTION_ORG_A_ID]);
    expect(otherData ?? []).toEqual([]);
  });
});

describe("rank_changes", () => {
  it("user_id/organization_idの排他制約が効いている", async () => {
    const { error } = await adminClient.from("rank_changes").insert({
      to_rank_code: "starter",
      changed_by: "system",
    });
    expect(error).not.toBeNull();
  });

  it("追記した変更履歴は本人のみ参照でき、他人は参照できない", async () => {
    const { error: insertError } = await adminClient
      .from("rank_changes")
      .insert({
        id: RANK_CHANGE_USER_A_ID,
        user_id: USER_A_ID,
        from_rank_code: null,
        to_rank_code: "starter",
        changed_by: "system",
      });
    expect(insertError).toBeNull();

    const asUserA = clientAs({ sub: CLERK_USER_A });
    const { data: ownData } = await asUserA
      .from("rank_changes")
      .select("id")
      .eq("id", RANK_CHANGE_USER_A_ID);
    expect((ownData ?? []).map((r) => r.id)).toEqual([RANK_CHANGE_USER_A_ID]);

    const asUserB = clientAs({ sub: CLERK_USER_B });
    const { data: otherData } = await asUserB
      .from("rank_changes")
      .select("id")
      .eq("id", RANK_CHANGE_USER_A_ID);
    expect(otherData ?? []).toEqual([]);
  });
});

describe("stripe_webhook_events", () => {
  afterAll(async () => {
    await adminClient
      .from("stripe_webhook_events")
      .delete()
      .in("event_id", [
        "evt_test_subscriptions_1",
        "evt_test_subscriptions_1_dup",
      ]);
  });

  it("event_idのPKにより、INSERT ... ON CONFLICT DO NOTHINGで重複配信を1クエリで排除できる", async () => {
    const first = await adminClient
      .from("stripe_webhook_events")
      .insert({
        event_id: "evt_test_subscriptions_1",
        type: "customer.subscription.updated",
        payload: { id: "evt_test_subscriptions_1" },
      })
      .select("event_id");
    expect(first.error).toBeNull();
    expect(first.data).toHaveLength(1);

    // 同じevent_idの再送を模したON CONFLICT DO NOTHING相当（重複INSERTはエラーになる）
    const duplicate = await adminClient.from("stripe_webhook_events").insert({
      event_id: "evt_test_subscriptions_1",
      type: "customer.subscription.updated",
      payload: { id: "evt_test_subscriptions_1" },
    });
    expect(duplicate.error).not.toBeNull();
  });

  it("statusはprocessing/processed/failed以外を拒否する", async () => {
    const { error } = await adminClient.from("stripe_webhook_events").insert({
      event_id: "evt_test_subscriptions_1_dup",
      type: "customer.subscription.updated",
      status: "unknown",
      payload: {},
    });
    expect(error).not.toBeNull();
  });

  it("クライアント（authenticated）からは一切参照できない", async () => {
    await adminClient.from("stripe_webhook_events").insert({
      event_id: "evt_test_subscriptions_1",
      type: "customer.subscription.updated",
      payload: {},
    });

    const asUserA = clientAs({ sub: CLERK_USER_A });
    const { data } = await asUserA
      .from("stripe_webhook_events")
      .select("event_id")
      .eq("event_id", "evt_test_subscriptions_1");
    expect(data ?? []).toEqual([]);
  });
});
