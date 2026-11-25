import { describe, it, expect, beforeAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";

// ログインしていない人（トークン無し）と、role クレームの無いトークン（PostgREST が anon として
// 実行する）では、public のどのテーブル・関数も読み書きできないことを確かめる（issue #794）。
// テーブル・関数は PostgREST の OpenAPI から列挙し、新しく足したものも自動で対象にする

// ローカル開発用Supabase CLIが固定で発行するJWTシークレット（`supabase start`の出力に
// 常に表示される既知の定数であり、プロジェクト固有の秘密情報ではない）
const LOCAL_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

// role を入れない（Clerk に role クレームを足す前のセッショントークンと同じ形）
function signTokenWithoutRole(): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: "clerk_test_anon_role_privileges",
    exp: Math.floor(Date.now() / 1000) + 3600,
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

type OpenApi = {
  paths: Record<
    string,
    {
      post?: {
        parameters?: {
          in?: string;
          schema?: { properties?: Record<string, unknown> };
        }[];
      };
    }
  >;
  definitions: Record<string, { properties: Record<string, unknown> }>;
};

let tables: { name: string; firstColumn: string }[] = [];
// 引数名が合わないと PostgREST が関数を見つけられず（PGRST202）権限の検査まで届かないため、
// 引数名も OpenAPI から取って null で呼ぶ
let functions: { name: string; args: Record<string, null> }[] = [];

beforeAll(async () => {
  const res = await fetch(`${supabaseUrl}/rest/v1/`, {
    headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY! },
  });
  const spec = (await res.json()) as OpenApi;
  const paths = Object.keys(spec.paths).filter((p) => p !== "/");
  tables = paths
    .filter((p) => !p.startsWith("/rpc/"))
    .map((p) => p.slice(1))
    .map((name) => ({
      name,
      firstColumn: Object.keys(spec.definitions[name].properties)[0],
    }));
  functions = paths
    .filter((p) => p.startsWith("/rpc/"))
    .map((p) => {
      const body = spec.paths[p].post?.parameters?.find((x) => x.in === "body");
      const argNames = Object.keys(body?.schema?.properties ?? {});
      return {
        name: p.slice("/rpc/".length),
        args: Object.fromEntries(argNames.map((a) => [a, null])),
      };
    });
});

const callers = [
  {
    label: "トークン無し",
    client: () =>
      createClient(supabaseUrl, anonKey, { auth: { persistSession: false } }),
  },
  {
    label: "role クレームの無いトークン",
    client: () =>
      createClient(supabaseUrl, anonKey, {
        global: {
          headers: { Authorization: `Bearer ${signTokenWithoutRole()}` },
        },
        auth: { persistSession: false },
      }),
  },
];

describe.each(callers)("anon ロール（$label）", ({ client }) => {
  it("public のテーブル・関数を列挙できている", () => {
    expect(tables.map((t) => t.name)).toContain("users");
    expect(tables.map((t) => t.name)).toContain("returns");
    expect(functions.map((f) => f.name)).toContain("get_current_user_id");
  });

  it("public のどのテーブルも参照できない", async () => {
    const supabase = client();
    const results = await Promise.all(
      tables.map(async ({ name }) => {
        const { error } = await supabase.from(name).select("*").limit(1);
        return { name, code: error?.code ?? null };
      })
    );
    expect(results).toEqual(
      tables.map(({ name }) => ({ name, code: "42501" }))
    );
  });

  it("public のどのテーブルにも追加・更新・削除できない", async () => {
    const supabase = client();
    const results = await Promise.all(
      tables.map(async ({ name, firstColumn }) => {
        const insert = await supabase.from(name).insert({});
        const update = await supabase
          .from(name)
          .update({ [firstColumn]: null })
          .not(firstColumn, "is", null);
        const del = await supabase
          .from(name)
          .delete()
          .not(firstColumn, "is", null);
        return {
          name,
          insert: insert.error?.code ?? null,
          update: update.error?.code ?? null,
          delete: del.error?.code ?? null,
        };
      })
    );
    expect(results).toEqual(
      tables.map(({ name }) => ({
        name,
        insert: "42501",
        update: "42501",
        delete: "42501",
      }))
    );
  });

  it("public のどの関数も実行できない", async () => {
    const supabase = client();
    const results = await Promise.all(
      functions.map(async ({ name, args }) => {
        const { error } = await supabase.rpc(name, args);
        return { name, code: error?.code ?? null };
      })
    );
    expect(results).toEqual(
      functions.map(({ name }) => ({ name, code: "42501" }))
    );
  });
});
