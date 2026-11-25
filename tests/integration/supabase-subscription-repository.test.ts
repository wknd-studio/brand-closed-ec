import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseSubscriptionRepository } from "@/infrastructure/supabase/supabase-subscription-repository";
import {
  SubscriptionStatus,
  type SubscriptionStatusValue,
} from "@/domain/value-objects/subscription-status";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000060";
const TEST_CLERK_ID = "clerk_test_subscription_repo";
// 解約済みの行の扱いを確かめる会員（上の会員の行の状態の流れと混ぜない）
const ENDED_USER_ID = "00000000-0000-0000-0000-000000000061";
const ENDED_CLERK_ID = "clerk_test_subscription_repo_ended";

// 不正なキーのクライアント。PostgRESTが認証エラーを返すため、DBエラー時の挙動を確認できる
const brokenClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  "invalid-key",
  { auth: { persistSession: false } }
);

async function cleanup() {
  await supabase
    .from("subscriptions")
    .delete()
    .in("user_id", [TEST_USER_ID, ENDED_USER_ID]);
  await supabase.from("users").delete().in("id", [TEST_USER_ID, ENDED_USER_ID]);
}

function subscriptionRow(
  stripeSubscriptionId: string,
  status: SubscriptionStatusValue
) {
  return {
    user_id: ENDED_USER_ID,
    stripe_customer_id: "cus_repo_test_ended",
    stripe_subscription_id: stripeSubscriptionId,
    status,
    rank_code: "basic",
    current_period_start: new Date(2026, 0, 1).toISOString(),
    current_period_end: new Date(2026, 1, 1).toISOString(),
  };
}

beforeAll(async () => {
  await cleanup();
  const { error } = await supabase.from("users").insert([
    {
      id: TEST_USER_ID,
      clerk_user_id: TEST_CLERK_ID,
      email: "subscription-repo-test@example.com",
      first_name: "テスト",
      last_name: "太郎",
      rank_code: "starter",
      onboarding_completed: true,
    },
    {
      id: ENDED_USER_ID,
      clerk_user_id: ENDED_CLERK_ID,
      email: "subscription-repo-test-ended@example.com",
      first_name: "テスト",
      last_name: "次郎",
      rank_code: "basic",
      onboarding_completed: true,
    },
  ]);
  if (error) throw error;
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

  // GitHub issue #777: 解約済み（docs/domain/membership.md「Stripe側の解約による利用停止」）の
  // 行は有効な行として返さない。退会（withdraw）はここで取った行の Stripe サブスクリプションを解約する
  describe("findActiveByUserId は解約済みの行を返さない", () => {
    afterEach(async () => {
      await supabase
        .from("subscriptions")
        .delete()
        .eq("user_id", ENDED_USER_ID);
    });

    it.each(SubscriptionStatus.endedValues())(
      "%s の行しか無ければ null",
      async (status) => {
        const { error } = await supabase
          .from("subscriptions")
          .insert(subscriptionRow(`sub_repo_test_ended_${status}`, status));
        expect(error).toBeNull();

        expect(await repo.findActiveByUserId(ENDED_USER_ID)).toBeNull();
      }
    );

    it.each(SubscriptionStatus.endedValues())(
      "%s の行と有効な行があれば、有効な行を返す",
      async (status) => {
        const { error } = await supabase
          .from("subscriptions")
          .insert([
            subscriptionRow(`sub_repo_test_ended_${status}`, status),
            subscriptionRow(`sub_repo_test_active_${status}`, "active"),
          ]);
        expect(error).toBeNull();

        const result = await repo.findActiveByUserId(ENDED_USER_ID);
        expect(result?.stripeSubscriptionId).toBe(
          `sub_repo_test_active_${status}`
        );
        expect(result?.status).toBe("active");
      }
    );

    it("incomplete（初回の支払い待ち）の行は有効な行として返す", async () => {
      const { error } = await supabase
        .from("subscriptions")
        .insert(subscriptionRow("sub_repo_test_incomplete", "incomplete"));
      expect(error).toBeNull();

      const result = await repo.findActiveByUserId(ENDED_USER_ID);
      expect(result?.status).toBe("incomplete");
    });
  });

  describe("DBエラー", () => {
    const broken = new SupabaseSubscriptionRepository(brokenClient);

    it("findActiveByUserIdは例外になる", async () => {
      await expect(broken.findActiveByUserId(TEST_USER_ID)).rejects.toThrow();
    });

    it("upsertは例外になる", async () => {
      await expect(
        broken.upsert({
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
        })
      ).rejects.toThrow();
    });

    it("INSERTの失敗は例外になる（存在しないuser_idで外部キー違反）", async () => {
      await expect(
        repo.upsert({
          userId: "00000000-0000-0000-0000-0000000000ff",
          stripeCustomerId: "cus_repo_test_fk",
          stripeSubscriptionId: "sub_repo_test_fk",
          stripeSubscriptionScheduleId: null,
          status: "active",
          rank: "basic",
          pendingRank: null,
          currentPeriodStart: new Date(2026, 0, 1),
          currentPeriodEnd: new Date(2026, 1, 1),
          cancelAtPeriodEnd: false,
          canceledAt: null,
        })
      ).rejects.toThrow();
    });

    it("UPDATEの失敗は例外になる（CHECK制約違反のstatus）", async () => {
      await expect(
        repo.upsert({
          userId: TEST_USER_ID,
          stripeCustomerId: "cus_repo_test",
          stripeSubscriptionId: "sub_repo_test",
          stripeSubscriptionScheduleId: null,
          status: "bogus" as never,
          rank: "standard",
          pendingRank: null,
          currentPeriodStart: new Date(2026, 0, 1),
          currentPeriodEnd: new Date(2026, 1, 1),
          cancelAtPeriodEnd: false,
          canceledAt: null,
        })
      ).rejects.toThrow();
    });
  });
});
