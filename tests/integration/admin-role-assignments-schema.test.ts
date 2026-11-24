import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";

// admin_role_assignments（運営スタッフのロール。#390）のスキーマ・RLS を確かめる

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
const adminClient = createClient<Database>(
  supabaseUrl,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);
// CHECK 制約の確認用（型付きだと未知のロールを tsc が弾くため）
const untypedClient = createClient(
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

const STAFF_A = {
  id: "00000000-0000-0000-0000-0000003900b1",
  clerkUserId: "clerk_test_role_assignment_a",
};
const STAFF_B = {
  id: "00000000-0000-0000-0000-0000003900b2",
  clerkUserId: "clerk_test_role_assignment_b",
};

async function cleanup() {
  const ids = [STAFF_A.id, STAFF_B.id];
  await adminClient
    .from("admin_role_assignments")
    .delete()
    .in("admin_user_id", ids);
  await adminClient.from("admin_users").delete().in("id", ids);
}

beforeAll(async () => {
  await cleanup();
  const { error } = await adminClient.from("admin_users").insert(
    [STAFF_A, STAFF_B].map((s) => ({
      id: s.id,
      clerk_user_id: s.clerkUserId,
      name: "運営 テスト",
      email: `${s.clerkUserId}@example.com`,
    }))
  );
  if (error) throw error;
  const { error: roleError } = await adminClient
    .from("admin_role_assignments")
    .insert([
      { admin_user_id: STAFF_A.id, role: "ops_billing" },
      { admin_user_id: STAFF_B.id, role: "ops_admin" },
    ]);
  if (roleError) throw roleError;
});

afterAll(async () => {
  await cleanup();
});

describe("admin_role_assignments", () => {
  it("3ロール以外のロールは保存できない（CHECK 制約）", async () => {
    const { error } = await untypedClient
      .from("admin_role_assignments")
      .update({ role: "org:admin" })
      .eq("admin_user_id", STAFF_A.id);
    expect(error?.code).toBe("23514");
  });

  it("1人の運営スタッフは1つのロールしか持てない", async () => {
    const { error } = await adminClient
      .from("admin_role_assignments")
      .insert({ admin_user_id: STAFF_A.id, role: "ops_procurement" });
    expect(error?.code).toBe("23505");
  });

  it("ロールを変えると updated_at が更新される", async () => {
    const before = await adminClient
      .from("admin_role_assignments")
      .select("updated_at")
      .eq("admin_user_id", STAFF_A.id)
      .single();
    const { data, error } = await adminClient
      .from("admin_role_assignments")
      .update({ role: "ops_procurement" })
      .eq("admin_user_id", STAFF_A.id)
      .select("role, updated_at")
      .single();
    expect(error).toBeNull();
    expect(data!.role).toBe("ops_procurement");
    expect(new Date(data!.updated_at).getTime()).toBeGreaterThan(
      new Date(before.data!.updated_at).getTime()
    );
  });

  it("運営スタッフ本人は自分のロールだけを読める", async () => {
    const { data, error } = await clientAs(STAFF_B.clerkUserId)
      .from("admin_role_assignments")
      .select("admin_user_id, role");
    expect(error).toBeNull();
    expect(data).toEqual([{ admin_user_id: STAFF_B.id, role: "ops_admin" }]);
  });

  it("運営スタッフ本人もロールを書き換えられない（付与はSQL・スクリプトで service role から行う）", async () => {
    const { data } = await clientAs(STAFF_A.clerkUserId)
      .from("admin_role_assignments")
      .update({ role: "ops_admin" })
      .eq("admin_user_id", STAFF_A.id)
      .select();
    expect(data ?? []).toEqual([]);
    const { data: after } = await adminClient
      .from("admin_role_assignments")
      .select("role")
      .eq("admin_user_id", STAFF_A.id)
      .single();
    expect(after!.role).not.toBe("ops_admin");
  });

  it("運営スタッフでない人（会員等）はロールを読めない", async () => {
    const { data, error } = await clientAs("clerk_test_not_staff")
      .from("admin_role_assignments")
      .select("admin_user_id");
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
