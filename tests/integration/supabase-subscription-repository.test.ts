import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseSubscriptionRepository } from "@/infrastructure/supabase/supabase-subscription-repository";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000060";
const TEST_CLERK_ID = "clerk_test_subscription_repo";

async function cleanup() {
  await supabase.from("subscriptions").delete().eq("user_id", TEST_USER_ID);
  await supabase.from("users").delete().eq("id", TEST_USER_ID);
}

beforeAll(async () => {
  await cleanup();
  await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: TEST_CLERK_ID,
    email: "subscription-repo-test@example.com",
    first_name: "テスト",
    last_name: "太郎",
    rank_code: "starter",
    onboarding_completed: true,
  });
});

afterAll(cleanup);

describe("SupabaseSubscriptionRepository", () => {
  const repo = new SupabaseSubscriptionRepository(supabase);

  it("アクティブなsubscriptionが無い場合はnullを返す", async () => {
    const result = await repo.findActiveByUserId(TEST_USER_ID);
    expect(result).toBeNull();
  });

  it("upsertで新規作成し、findActiveByUserIdで取得できる", async () => {
    await repo.upsert({
      userId: TEST_USER_ID,
      stripeCustomerId: "cus_repo_test",
      stripeSubscriptionId: "sub_repo_test",
      stripeSubscriptionScheduleId: null,
      status: "active",
      rank: "basic",
      pendingRank: null,
      currentPeriodStart: new Date(2026, 0, 1),
      currentPeriodEnd: new Date(2026, 1, 1),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });

    const result = await repo.findActiveByUserId(TEST_USER_ID);
    expect(result).not.toBeNull();
    expect(result!.stripeSubscriptionId).toBe("sub_repo_test");
    expect(result!.rank).toBe("basic");
  });

  it("既存のアクティブなsubscriptionがある場合はupsertで更新する（新規行を作らない）", async () => {
    await repo.upsert({
      userId: TEST_USER_ID,
      stripeCustomerId: "cus_repo_test",
      stripeSubscriptionId: "sub_repo_test",
      stripeSubscriptionScheduleId: null,
      status: "past_due",
      rank: "standard",
      pendingRank: null,
      currentPeriodStart: new Date(2026, 0, 1),
      currentPeriodEnd: new Date(2026, 1, 1),
      cancelAtPeriodEnd: false,
      canceledAt: null,
    });

    const { count } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", TEST_USER_ID);
    expect(count).toBe(1);

    const result = await repo.findActiveByUserId(TEST_USER_ID);
    expect(result!.status).toBe("past_due");
    expect(result!.rank).toBe("standard");
  });
});
