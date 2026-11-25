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

async function fetchOpenApi(headers: Record<string, string>): Promise<OpenApi> {
  const res = await fetch(`${supabaseUrl}/rest/v1/`, { headers });
  return (await res.json()) as OpenApi;
}

let tables: { name: string; firstColumn: string }[] = [];
// 引数名が合わないと PostgREST が関数を見つけられず（PGRST202）権限の検査まで届かないため、
// 引数名も OpenAPI から取って null で呼ぶ
let functions: { name: string; args: Record<string, null> }[] = [];

beforeAll(async () => {
  const spec = await fetchOpenApi({
    apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  });
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
    headers: (): Record<string, string> => ({}),
  },
  {
    label: "role クレームの無いトークン",
    headers: (): Record<string, string> => ({
      Authorization: `Bearer ${signTokenWithoutRole()}`,
    }),
  },
];

describe.each(callers)("anon ロール（$label）", ({ headers }) => {
  const client = () =>
    createClient(supabaseUrl, anonKey, {
      global: { headers: headers() },
      auth: { persistSession: false },
    });

  it("public のテーブル・関数を列挙できている", () => {
    expect(tables.map((t) => t.name)).toContain("users");
    expect(tables.map((t) => t.name)).toContain("returns");
    expect(functions.map((f) => f.name)).toContain("get_current_user_id");
  });

  // PostgREST の OpenAPI は、そのロールが権限（列の単位の権限も含む）を持つテーブル・関数だけを出す。
  // 下の実際の問い合わせは、RLS の関数（get_current_user_id）の実行権限で先に弾かれることがあり、
  // 列の単位で付けた権限（GRANT SELECT (列) TO anon 等）を見逃すため、こちらで確かめる
  it("anon が権限を持つテーブル・列・関数が1つも無い", async () => {
    const spec = await fetchOpenApi({ apikey: anonKey, ...headers() });
    expect(Object.keys(spec.paths)).toEqual(["/"]);
  });

  it("public のどのテーブルも参照・追加・更新・削除できない", async () => {
    const supabase = client();
    const results = await Promise.all(
      tables.map(async ({ name, firstColumn }) => {
        const select = await supabase.from(name).select("*").limit(1);
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
          select: select.error?.code ?? null,
          insert: insert.error?.code ?? null,
          update: update.error?.code ?? null,
          delete: del.error?.code ?? null,
        };
      })
    );
    expect(results).toEqual(
      tables.map(({ name }) => ({
        name,
        select: "42501",
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
        return { name, message: error?.message ?? null };
      })
    );
    expect(results).toEqual(
      functions.map(({ name }) => ({
        name,
        message: `permission denied for function ${name}`,
      }))
    );
  });
});
