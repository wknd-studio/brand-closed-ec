import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseFavoriteRepository } from "@/infrastructure/supabase/supabase-favorite-repository";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

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
