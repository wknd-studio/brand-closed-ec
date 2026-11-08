import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";

// ローカル開発用Supabase CLIが固定で発行するJWTシークレット（`supabase start`の出力に
// 常に表示される既知の定数であり、プロジェクト固有の秘密情報ではない）。
// 本番では Clerk のセッショントークンを Supabase が third-party auth として検証する
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

const { getToken } = vi.hoisted(() => ({
  getToken: vi.fn<() => Promise<string | null>>(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  requireAuth: vi.fn(async () => ({ getToken })),
}));

import { createServerClient } from "@/infrastructure/supabase/server";

const adminClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const USER_A_ID = "00000000-0000-0000-0000-0000000448a1";
const USER_B_ID = "00000000-0000-0000-0000-0000000448b1";
const CLERK_USER_A = "clerk_test_server_client_a";
const CLERK_USER_B = "clerk_test_server_client_b";

async function cleanup() {
  await adminClient.from("users").delete().in("id", [USER_A_ID, USER_B_ID]);
}

beforeAll(async () => {
  await cleanup();
  const { error } = await adminClient.from("users").insert([
    {
      id: USER_A_ID,
      clerk_user_id: CLERK_USER_A,
      email: "server-client-a@example.com",
      first_name: "エー",
      last_name: "テスト",
    },
    {
      id: USER_B_ID,
      clerk_user_id: CLERK_USER_B,
      email: "server-client-b@example.com",
      first_name: "ビー",
      last_name: "テスト",
    },
  ]);
  if (error) throw error;
});

afterAll(async () => {
  await cleanup();
});

describe("createServerClient", () => {
  it("ログイン中の会員のトークンで接続し、RLS により自分の行だけを取得できる", async () => {
    getToken.mockResolvedValue(signTestJwt({ sub: CLERK_USER_A }));
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("users")
      .select("id")
      .in("id", [USER_A_ID, USER_B_ID]);

    expect(error).toBeNull();
    expect(data).toEqual([{ id: USER_A_ID }]);
  });

  it("トークンが無いときは匿名で接続し、会員の行を取得できない", async () => {
    getToken.mockResolvedValue(null);
    const supabase = await createServerClient();

    const { data, error } = await supabase
      .from("users")
      .select("id")
      .in("id", [USER_A_ID, USER_B_ID]);

    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});
