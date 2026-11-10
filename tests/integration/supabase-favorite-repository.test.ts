import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "node:crypto";
import type { Database } from "@/types/database.types";
import { SupabaseFavoriteRepository } from "@/infrastructure/supabase/supabase-favorite-repository";

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

// 会員のセッションと同じく、RLS が効くクライアント
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

const TEST_USER_ID = "00000000-0000-0000-0000-000000000030";
const OTHER_USER_ID = "00000000-0000-0000-0000-000000000031";

async function cleanupFavorites() {
  await supabase
    .from("favorites")
    .delete()
    .in("user_id", [TEST_USER_ID, OTHER_USER_ID]);
}

beforeAll(async () => {
  await cleanupFavorites();
  for (const [id, clerkId] of [
    [TEST_USER_ID, "clerk_test_favorite_infra"],
    [OTHER_USER_ID, "clerk_test_favorite_infra_other"],
  ]) {
    await supabase.from("users").delete().eq("id", id);
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
});

beforeEach(cleanupFavorites);

afterAll(async () => {
  await cleanupFavorites();
  await supabase.from("users").delete().in("id", [TEST_USER_ID, OTHER_USER_ID]);
});

describe("SupabaseFavoriteRepository", () => {
  const repo = new SupabaseFavoriteRepository(supabase);

  it("addで登録した商品IDがfindSanityProductIdsByUserIdで取得できる", async () => {
    await repo.add(TEST_USER_ID, "prod-1");
    await repo.add(TEST_USER_ID, "prod-2");

    const ids = await repo.findSanityProductIdsByUserId(TEST_USER_ID);

    expect(ids).toEqual(expect.arrayContaining(["prod-1", "prod-2"]));
    expect(ids).toHaveLength(2);
  });

  it("同じ商品を重複してaddしてもエラーにならず1件のまま（UNIQUE制約）", async () => {
    await repo.add(TEST_USER_ID, "prod-1");
    await repo.add(TEST_USER_ID, "prod-1");

    const ids = await repo.findSanityProductIdsByUserId(TEST_USER_ID);

    expect(ids).toEqual(["prod-1"]);
  });

  it("removeで指定した商品だけを削除する", async () => {
    await repo.add(TEST_USER_ID, "prod-1");
    await repo.add(TEST_USER_ID, "prod-2");

    await repo.remove(TEST_USER_ID, "prod-1");

    const ids = await repo.findSanityProductIdsByUserId(TEST_USER_ID);
    expect(ids).toEqual(["prod-2"]);
  });

  it("他ユーザーのお気に入りには影響しない", async () => {
    await repo.add(TEST_USER_ID, "prod-1");
    await repo.add(OTHER_USER_ID, "prod-1");

    await repo.remove(TEST_USER_ID, "prod-1");

    const otherIds = await repo.findSanityProductIdsByUserId(OTHER_USER_ID);
    expect(otherIds).toEqual(["prod-1"]);
  });

  it("お気に入りが無いユーザーは空配列を返す", async () => {
    const ids = await repo.findSanityProductIdsByUserId(TEST_USER_ID);
    expect(ids).toEqual([]);
  });
});

// supabase-js は失敗しても例外を投げず error を返すため、捨てると書き込みの失敗が成功扱いに、
// 読み取りの失敗が「0件」に化ける（#614）
describe("SupabaseFavoriteRepository（RLS・DBエラー・制約違反）", () => {
  const repo = new SupabaseFavoriteRepository(supabase);
  const repoAsTestUser = new SupabaseFavoriteRepository(
    clientAs("clerk_test_favorite_infra")
  );

  it("会員のクライアントで自分のお気に入りは登録・取得・削除できる", async () => {
    await repoAsTestUser.add(TEST_USER_ID, "prod-1");
    await repoAsTestUser.add(TEST_USER_ID, "prod-1");
    expect(
      await repoAsTestUser.findSanityProductIdsByUserId(TEST_USER_ID)
    ).toEqual(["prod-1"]);

    await repoAsTestUser.remove(TEST_USER_ID, "prod-1");
    expect(await repo.findSanityProductIdsByUserId(TEST_USER_ID)).toEqual([]);
  });

  it("会員のクライアントで他の会員のお気に入りを登録しようとすると、RLSに拒否されて例外を投げる", async () => {
    await expect(repoAsTestUser.add(OTHER_USER_ID, "prod-1")).rejects.toThrow(
      /row-level security/
    );
    expect(await repo.findSanityProductIdsByUserId(OTHER_USER_ID)).toEqual([]);
  });

  it("add は制約違反（存在しない会員）で例外を投げる", async () => {
    await expect(
      repo.add("00000000-0000-0000-0000-00000000003f", "prod-1")
    ).rejects.toThrow(/foreign key/);
  });

  it("findSanityProductIdsByUserId は読み取りの失敗（不正なUUID）で例外を投げる", async () => {
    await expect(
      repo.findSanityProductIdsByUserId("not-a-uuid")
    ).rejects.toThrow();
  });

  it("remove は書き込みの失敗（不正なUUID）で例外を投げる", async () => {
    await expect(repo.remove("not-a-uuid", "prod-1")).rejects.toThrow();
  });
});
