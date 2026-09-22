import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";

// docs/db-schema-redesign.md「移行方針」7番（GitHub issue #218）
// admin_users/admin_memberships新設・get_current_admin_user_id()・RLSを検証する統合テスト。

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
// 未定義カラム指定確認用（型付きだとtscが弾くため）
const untypedClient = createClient(
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

const ADMIN_USER_A_ID = "00000000-0000-0000-0000-0000000000c1";
const ADMIN_USER_B_ID = "00000000-0000-0000-0000-0000000000c2";
const CLERK_ADMIN_A = "clerk_test_admin_a";
const CLERK_ADMIN_B = "clerk_test_admin_b";

async function cleanup() {
  await adminClient
    .from("admin_memberships")
    .delete()
    .in("admin_user_id", [ADMIN_USER_A_ID, ADMIN_USER_B_ID]);
  await adminClient
    .from("admin_users")
    .delete()
    .in("id", [ADMIN_USER_A_ID, ADMIN_USER_B_ID]);
}

beforeAll(async () => {
  await cleanup();
  const { error } = await adminClient.from("admin_users").insert([
    {
      id: ADMIN_USER_A_ID,
      clerk_user_id: CLERK_ADMIN_A,
      name: "運営 エー",
      email: "admin-a@example.com",
    },
    {
      id: ADMIN_USER_B_ID,
      clerk_user_id: CLERK_ADMIN_B,
      name: "運営 ビー",
      email: "admin-b@example.com",
    },
  ]);
  if (error) throw error;

  const { error: membershipError } = await adminClient
    .from("admin_memberships")
    .insert([
      { admin_user_id: ADMIN_USER_A_ID, clerk_role: "org:admin" },
      { admin_user_id: ADMIN_USER_B_ID, clerk_role: "org:order_manager" },
    ]);
  if (membershipError) throw membershipError;
});

afterAll(async () => {
  await cleanup();
});

describe("admin_users", () => {
  it("clerk_user_idは一意制約に違反すると拒否される", async () => {
    const { error } = await adminClient.from("admin_users").insert({
      clerk_user_id: CLERK_ADMIN_A,
      name: "重複 テスト",
      email: "dup@example.com",
    });
    expect(error).not.toBeNull();
  });

  it("nameは必須", async () => {
    const { error } = await untypedClient.from("admin_users").insert({
      clerk_user_id: "clerk_test_admin_no_name",
      email: "no-name@example.com",
    });
    expect(error).not.toBeNull();
  });
});

describe("admin_memberships", () => {
  it("1人のadmin_userにつき1行しか持てない（admin_user_id UNIQUE）", async () => {
    const { error } = await adminClient.from("admin_memberships").insert({
      admin_user_id: ADMIN_USER_A_ID,
      clerk_role: "org:order_manager",
    });
    expect(error).not.toBeNull();
  });

  it("存在しないadmin_userへの紐付けは拒否される", async () => {
    const { error } = await adminClient.from("admin_memberships").insert({
      admin_user_id: "00000000-0000-0000-0000-00000000dead",
      clerk_role: "org:admin",
    });
    expect(error).not.toBeNull();
  });

  it("clerk_roleは未知の値でも受け付ける（CHECK制約無し、バリデーションはアプリ層）", async () => {
    const { error } = await adminClient
      .from("admin_memberships")
      .update({ clerk_role: "org:not_a_defined_role" })
      .eq("admin_user_id", ADMIN_USER_B_ID);
    expect(error).toBeNull();

    await adminClient
      .from("admin_memberships")
      .update({ clerk_role: "org:order_manager" })
      .eq("admin_user_id", ADMIN_USER_B_ID);
  });

  it("updated_atはUPDATE時に自動更新される", async () => {
    const { data: before } = await adminClient
      .from("admin_memberships")
      .select("updated_at")
      .eq("admin_user_id", ADMIN_USER_A_ID)
      .single();

    await new Promise((resolve) => setTimeout(resolve, 10));
    await adminClient
      .from("admin_memberships")
      .update({ clerk_role: "org:admin" })
      .eq("admin_user_id", ADMIN_USER_A_ID);

    const { data: after } = await adminClient
      .from("admin_memberships")
      .select("updated_at")
      .eq("admin_user_id", ADMIN_USER_A_ID)
      .single();

    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(
      new Date(before!.updated_at).getTime()
    );
  });
});

describe("get_current_admin_user_id() / RLS", () => {
  it("運営スタッフ本人は自分自身のadmin_usersのみ参照できる", async () => {
    const asAdminA = clientAs({ sub: CLERK_ADMIN_A });
    const { data } = await asAdminA
      .from("admin_users")
      .select("id")
      .in("id", [ADMIN_USER_A_ID, ADMIN_USER_B_ID]);
    expect((data ?? []).map((r) => r.id)).toEqual([ADMIN_USER_A_ID]);
  });

  it("運営スタッフ本人は自分自身のadmin_membershipsのみ参照できる", async () => {
    const asAdminA = clientAs({ sub: CLERK_ADMIN_A });
    const { data } = await asAdminA
      .from("admin_memberships")
      .select("admin_user_id")
      .in("admin_user_id", [ADMIN_USER_A_ID, ADMIN_USER_B_ID]);
    expect((data ?? []).map((r) => r.admin_user_id)).toEqual([ADMIN_USER_A_ID]);
  });

  it("admin_usersに存在しないClerkユーザーは何も参照できない", async () => {
    const asOutsider = clientAs({ sub: "clerk_test_admin_outsider" });
    const { data } = await asOutsider
      .from("admin_users")
      .select("id")
      .in("id", [ADMIN_USER_A_ID, ADMIN_USER_B_ID]);
    expect(data ?? []).toEqual([]);
  });

  it("運営スタッフはadmin_usersへ書き込めない（Webhook経由のみ）", async () => {
    const asAdminA = clientAs({ sub: CLERK_ADMIN_A });
    await asAdminA
      .from("admin_users")
      .update({ name: "改ざん" })
      .eq("id", ADMIN_USER_A_ID);
    const { data } = await adminClient
      .from("admin_users")
      .select("name")
      .eq("id", ADMIN_USER_A_ID)
      .single();
    expect(data?.name).toBe("運営 エー");
  });

  it("運営スタッフはadmin_membershipsへ書き込めない（Webhook経由のみ）", async () => {
    const asAdminA = clientAs({ sub: CLERK_ADMIN_A });
    await asAdminA
      .from("admin_memberships")
      .update({ clerk_role: "org:order_manager" })
      .eq("admin_user_id", ADMIN_USER_A_ID);
    const { data } = await adminClient
      .from("admin_memberships")
      .select("clerk_role")
      .eq("admin_user_id", ADMIN_USER_A_ID)
      .single();
    expect(data?.clerk_role).toBe("org:admin");
  });
});
