import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseSubscriptionOnboardingRepository } from "@/infrastructure/supabase/supabase-subscription-onboarding-repository";
import type { ConfirmSubscriptionOnboardingInput } from "@/repositories/subscription-onboarding-repository";
import type { SubscriptionStatus } from "@/repositories/subscription-repository";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000363";
const TEST_CLERK_ID = "clerk_test_subscription_onboarding_repo";

// 同じstripe_subscription_idが別の会員で届く場合の、先に記録された側の会員
const OTHER_USER_ID = "00000000-0000-0000-0000-000000000477";
const OTHER_CLERK_ID = "clerk_test_subscription_onboarding_repo_other";

const repo = new SupabaseSubscriptionOnboardingRepository(supabase);

function makeInput(
  overrides?: Partial<ConfirmSubscriptionOnboardingInput>
): ConfirmSubscriptionOnboardingInput {
  return {
    userId: TEST_USER_ID,
    rank: "standard",
    stripeCustomerId: "cus_onboarding_repo_test",
    stripeSubscriptionId: "sub_onboarding_repo_test",
    status: "active",
    currentPeriodStart: new Date("2026-10-18T00:00:00Z"),
    currentPeriodEnd: new Date("2026-11-18T00:00:00Z"),
    billingAnchorDay: 18,
    ...overrides,
  };
}

async function cleanup() {
  const userIds = [TEST_USER_ID, OTHER_USER_ID];
  await supabase.from("rank_changes").delete().in("user_id", userIds);
  await supabase.from("subscriptions").delete().in("user_id", userIds);
  await supabase.from("users").delete().in("id", userIds);
}

async function insertOtherUser() {
  const { error } = await supabase.from("users").insert({
    id: OTHER_USER_ID,
    clerk_user_id: OTHER_CLERK_ID,
    email: "subscription-onboarding-repo-other-test@example.com",
    first_name: "テスト",
    last_name: "次郎",
    rank_code: "starter",
    onboarding_completed: false,
  });
  if (error) throw error;
}

async function insertUser(initialFeePaidRankCode: string | null = null) {
  const { error } = await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: TEST_CLERK_ID,
    email: "subscription-onboarding-repo-test@example.com",
    first_name: "テスト",
    last_name: "太郎",
    rank_code: "starter",
    onboarding_completed: false,
    initial_fee_paid_rank_code: initialFeePaidRankCode,
  });
  if (error) throw error;
}

async function fetchState() {
  const { data: user } = await supabase
    .from("users")
    .select(
      "rank_code, initial_fee_paid_rank_code, stripe_customer_id, billing_anchor_day, onboarding_completed"
    )
    .eq("id", TEST_USER_ID)
    .single();
  const { data: subscriptions } = await supabase
    .from("subscriptions")
    .select(
      "stripe_customer_id, stripe_subscription_id, status, rank_code, current_period_start, current_period_end"
    )
    .eq("user_id", TEST_USER_ID);
  const { data: rankChanges } = await supabase
    .from("rank_changes")
    .select(
      "from_rank_code, to_rank_code, changed_by, initial_fee_charged, stripe_subscription_id"
    )
    .eq("user_id", TEST_USER_ID);
  return { user, subscriptions, rankChanges };
}

beforeEach(async () => {
  await cleanup();
});

afterAll(cleanup);

describe("SupabaseSubscriptionOnboardingRepository.confirm（入会確定のRPC）", () => {
  it("users・subscriptions・rank_changesを同時に更新し、confirmedを返す", async () => {
    await insertUser();

    await expect(repo.confirm(makeInput())).resolves.toBe("confirmed");

    const { user, subscriptions, rankChanges } = await fetchState();
    expect(user).toEqual({
      rank_code: "standard",
      initial_fee_paid_rank_code: "standard",
      stripe_customer_id: "cus_onboarding_repo_test",
      billing_anchor_day: 18,
      onboarding_completed: true,
    });
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions?.[0]).toMatchObject({
      stripe_customer_id: "cus_onboarding_repo_test",
      stripe_subscription_id: "sub_onboarding_repo_test",
      status: "active",
      rank_code: "standard",
    });
    expect(new Date(subscriptions![0].current_period_start)).toEqual(
      new Date("2026-10-18T00:00:00Z")
    );
    expect(new Date(subscriptions![0].current_period_end)).toEqual(
      new Date("2026-11-18T00:00:00Z")
    );
    expect(rankChanges).toEqual([
      {
        from_rank_code: null,
        to_rank_code: "standard",
        changed_by: "member",
        initial_fee_charged: true,
        stripe_subscription_id: "sub_onboarding_repo_test",
      },
    ]);
  });

  it("同じstripe_subscription_idで再度呼んでも何も変えず、already_confirmedを返す（rank_changesが2行にならない）", async () => {
    await insertUser();
    await repo.confirm(makeInput());

    await expect(
      repo.confirm(makeInput({ billingAnchorDay: 25 }))
    ).resolves.toBe("already_confirmed");

    const { user, subscriptions, rankChanges } = await fetchState();
    expect(user?.billing_anchor_day).toBe(18);
    expect(subscriptions).toHaveLength(1);
    expect(rankChanges).toHaveLength(1);
  });

  it("途中（subscriptionsの作成）で失敗したらusersの更新も含めて何も残らない", async () => {
    await insertUser();

    await expect(
      repo.confirm(
        makeInput({ status: "not_a_status" as unknown as SubscriptionStatus })
      )
    ).rejects.toThrow();

    const { user, subscriptions, rankChanges } = await fetchState();
    expect(user).toEqual({
      rank_code: "starter",
      initial_fee_paid_rank_code: null,
      stripe_customer_id: null,
      billing_anchor_day: null,
      onboarding_completed: false,
    });
    expect(subscriptions).toHaveLength(0);
    expect(rankChanges).toHaveLength(0);
  });

  it("member_ranksに無いランクで失敗したら、usersの更新も含めて何も残らない", async () => {
    await insertUser();

    // subscriptions.rank_codeのFK（即時チェック）で失敗する。subscriptionsの作成後に
    // ランク変更の記録だけを失敗させる手段はテストから取れないため、そこでの
    // ロールバックは関数1回の呼び出しが1トランザクションであることに依る
    await expect(
      repo.confirm(
        makeInput({
          rank: "no_such_rank" as ConfirmSubscriptionOnboardingInput["rank"],
        })
      )
    ).rejects.toThrow();

    const { user, subscriptions, rankChanges } = await fetchState();
    expect(user?.onboarding_completed).toBe(false);
    expect(user?.stripe_customer_id).toBeNull();
    expect(subscriptions).toHaveLength(0);
    expect(rankChanges).toHaveLength(0);
  });

  it("途中で失敗したあとに再度呼ぶと、入会が最後まで確定する", async () => {
    await insertUser();
    await expect(
      repo.confirm(
        makeInput({ status: "not_a_status" as unknown as SubscriptionStatus })
      )
    ).rejects.toThrow();

    await repo.confirm(makeInput());

    const { user, subscriptions, rankChanges } = await fetchState();
    expect(user?.onboarding_completed).toBe(true);
    expect(user?.initial_fee_paid_rank_code).toBe("standard");
    expect(subscriptions).toHaveLength(1);
    expect(rankChanges).toHaveLength(1);
  });

  it("支払い済み最高ランクが選んだランクより高ければ、initial_fee_paid_rank_codeを下げない", async () => {
    await insertUser("pro");

    await repo.confirm(makeInput({ rank: "basic" }));

    const { user } = await fetchState();
    expect(user?.rank_code).toBe("basic");
    expect(user?.initial_fee_paid_rank_code).toBe("pro");
  });

  it("支払い済み最高ランクより高いランクを選べば、initial_fee_paid_rank_codeを上げる", async () => {
    await insertUser("basic");

    await repo.confirm(makeInput({ rank: "pro" }));

    const { user } = await fetchState();
    expect(user?.initial_fee_paid_rank_code).toBe("pro");
  });

  it("入会済みの会員に別のstripe_subscription_idで呼ぶと、何も変えずにconflicting_subscriptionを返す", async () => {
    await insertUser();
    await repo.confirm(makeInput());

    await expect(
      repo.confirm(
        makeInput({
          stripeSubscriptionId: "sub_onboarding_repo_other",
          rank: "pro",
        })
      )
    ).resolves.toBe("conflicting_subscription");

    const { user, subscriptions, rankChanges } = await fetchState();
    expect(user?.rank_code).toBe("standard");
    expect(subscriptions?.map((s) => s.stripe_subscription_id)).toEqual([
      "sub_onboarding_repo_test",
    ]);
    expect(rankChanges).toHaveLength(1);
  });

  it("解約済みのサブスクリプションしか無い会員でも、別のstripe_subscription_idならconflicting_subscriptionを返す", async () => {
    await insertUser();
    await repo.confirm(makeInput());
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("user_id", TEST_USER_ID);
    if (error) throw error;

    await expect(
      repo.confirm(
        makeInput({ stripeSubscriptionId: "sub_onboarding_repo_other" })
      )
    ).resolves.toBe("conflicting_subscription");

    const { subscriptions, rankChanges } = await fetchState();
    expect(subscriptions).toHaveLength(1);
    expect(rankChanges).toHaveLength(1);
  });

  it("有効な会員が見つからなければ、何も変えずにmember_not_foundを返す", async () => {
    await expect(repo.confirm(makeInput())).resolves.toBe("member_not_found");

    const { subscriptions, rankChanges } = await fetchState();
    expect(subscriptions).toHaveLength(0);
    expect(rankChanges).toHaveLength(0);
  });

  it("退会済みの会員なら、何も変えずにmember_not_foundを返す", async () => {
    await insertUser();
    const { error } = await supabase
      .from("users")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", TEST_USER_ID);
    if (error) throw error;

    await expect(repo.confirm(makeInput())).resolves.toBe("member_not_found");

    const { user, subscriptions, rankChanges } = await fetchState();
    expect(user?.onboarding_completed).toBe(false);
    expect(subscriptions).toHaveLength(0);
    expect(rankChanges).toHaveLength(0);
  });

  it("同じstripe_subscription_idの行が別の会員で既にあれば、一意制約違反にせず、何も変えずにconflicting_subscriptionを返す", async () => {
    await insertUser();
    await insertOtherUser();
    await repo.confirm(makeInput({ userId: OTHER_USER_ID }));

    await expect(repo.confirm(makeInput())).resolves.toBe(
      "conflicting_subscription"
    );

    const { user, subscriptions, rankChanges } = await fetchState();
    expect(user).toEqual({
      rank_code: "starter",
      initial_fee_paid_rank_code: null,
      stripe_customer_id: null,
      billing_anchor_day: null,
      onboarding_completed: false,
    });
    expect(subscriptions).toHaveLength(0);
    expect(rankChanges).toHaveLength(0);
  });
});
