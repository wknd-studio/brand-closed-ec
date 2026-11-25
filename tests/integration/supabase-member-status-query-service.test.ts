import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseMemberStatusQueryService } from "@/infrastructure/supabase/supabase-member-status-query-service";
import { memberStatusQueryService } from "@/composition/member-status-query";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const ACTIVE_ONLY_ID = "00000000-0000-0000-0000-000000454a01";
const WITHDRAWN_ONLY_ID = "00000000-0000-0000-0000-000000454b01";
const COEXIST_WITHDRAWN_ID = "00000000-0000-0000-0000-000000454c01";
const COEXIST_ACTIVE_ID = "00000000-0000-0000-0000-000000454c02";
const NOT_ONBOARDED_ID = "00000000-0000-0000-0000-000000454d01";
const CANCELED_ID = "00000000-0000-0000-0000-000000380a01";
const PAST_DUE_ID = "00000000-0000-0000-0000-000000380b01";
const RECONTRACTED_ID = "00000000-0000-0000-0000-000000380c01";
const NO_SUBSCRIPTION_ID = "00000000-0000-0000-0000-000000380d01";
const ALL_USER_IDS = [
  ACTIVE_ONLY_ID,
  WITHDRAWN_ONLY_ID,
  COEXIST_WITHDRAWN_ID,
  COEXIST_ACTIVE_ID,
  NOT_ONBOARDED_ID,
  CANCELED_ID,
  PAST_DUE_ID,
  RECONTRACTED_ID,
  NO_SUBSCRIPTION_ID,
];

const CLERK_ACTIVE_ONLY = "clerk_test_member_status_active";
const CLERK_WITHDRAWN_ONLY = "clerk_test_member_status_withdrawn";
const CLERK_COEXIST = "clerk_test_member_status_coexist";
const CLERK_NOT_ONBOARDED = "clerk_test_member_status_not_onboarded";
const CLERK_MISSING = "clerk_test_member_status_missing";
const CLERK_CANCELED = "clerk_test_member_status_canceled";
const CLERK_PAST_DUE = "clerk_test_member_status_past_due";
const CLERK_RECONTRACTED = "clerk_test_member_status_recontracted";
const CLERK_NO_SUBSCRIPTION = "clerk_test_member_status_no_subscription";

function user(
  id: string,
  clerkUserId: string,
  overrides: Partial<Database["public"]["Tables"]["users"]["Insert"]> = {}
): Database["public"]["Tables"]["users"]["Insert"] {
  return {
    id,
    clerk_user_id: clerkUserId,
    email: `${id}@example.com`,
    first_name: "テスト",
    last_name: "太郎",
    rank_code: "standard",
    onboarding_completed: true,
    billing_anchor_day: 10,
    ...overrides,
  };
}

function subscription(
  userId: string,
  status: string,
  suffix = ""
): Database["public"]["Tables"]["subscriptions"]["Insert"] {
  return {
    user_id: userId,
    stripe_customer_id: `cus_test_${userId}`,
    stripe_subscription_id: `sub_test_${userId}${suffix}`,
    status,
    rank_code: "standard",
    current_period_start: "2026-11-01T00:00:00.000Z",
    current_period_end: "2026-12-01T00:00:00.000Z",
  };
}

async function cleanup() {
  await supabase.from("subscriptions").delete().in("user_id", ALL_USER_IDS);
  await supabase.from("users").delete().in("id", ALL_USER_IDS);
}

beforeAll(async () => {
  await cleanup();
  const { error } = await supabase.from("users").insert([
    user(ACTIVE_ONLY_ID, CLERK_ACTIVE_ONLY),
    user(WITHDRAWN_ONLY_ID, CLERK_WITHDRAWN_ONLY, {
      deleted_at: "2026-07-01T00:00:00.000Z",
    }),
    // 退会後に同じ Clerk ユーザーで再入会途中の会員。有効な行は入会未完了
    user(COEXIST_WITHDRAWN_ID, CLERK_COEXIST, {
      deleted_at: "2026-07-01T00:00:00.000Z",
    }),
    user(COEXIST_ACTIVE_ID, CLERK_COEXIST, { onboarding_completed: false }),
    user(NOT_ONBOARDED_ID, CLERK_NOT_ONBOARDED, {
      onboarding_completed: false,
    }),
    user(CANCELED_ID, CLERK_CANCELED),
    user(PAST_DUE_ID, CLERK_PAST_DUE),
    user(RECONTRACTED_ID, CLERK_RECONTRACTED),
    user(NO_SUBSCRIPTION_ID, CLERK_NO_SUBSCRIPTION),
  ]);
  if (error) throw error;
  const { error: subscriptionError } = await supabase
    .from("subscriptions")
    .insert([
      subscription(ACTIVE_ONLY_ID, "active"),
      subscription(WITHDRAWN_ONLY_ID, "canceled"),
      subscription(CANCELED_ID, "canceled"),
      subscription(PAST_DUE_ID, "past_due"),
      // 解約のあとに再契約した会員。解約済みの行は履歴として残る
      subscription(RECONTRACTED_ID, "canceled", "_old"),
      subscription(RECONTRACTED_ID, "active"),
    ]);
  if (subscriptionError) throw subscriptionError;
});

afterAll(cleanup);

describe("SupabaseMemberStatusQueryService.findMemberStatus", () => {
  const service = new SupabaseMemberStatusQueryService(supabase);

  it("有効な行だけがある会員は、入会済み・退会していない・利用停止でないを返す", async () => {
    await expect(service.findMemberStatus(CLERK_ACTIVE_ONLY)).resolves.toEqual({
      onboardingCompleted: true,
      withdrawn: false,
      subscriptionEnded: false,
    });
  });

  it("有効な行が入会未完了の会員は、入会未完了を返す", async () => {
    await expect(
      service.findMemberStatus(CLERK_NOT_ONBOARDED)
    ).resolves.toEqual({
      onboardingCompleted: false,
      withdrawn: false,
      subscriptionEnded: false,
    });
  });

  it("退会済みの行だけがある会員は、退会済みを返す", async () => {
    await expect(
      service.findMemberStatus(CLERK_WITHDRAWN_ONLY)
    ).resolves.toEqual({
      onboardingCompleted: true,
      withdrawn: true,
      subscriptionEnded: true,
    });
  });

  it("退会済みの行と有効な行が併存する会員は、有効な行を返す", async () => {
    await expect(service.findMemberStatus(CLERK_COEXIST)).resolves.toEqual({
      onboardingCompleted: false,
      withdrawn: false,
      subscriptionEnded: false,
    });
  });

  // GitHub issue #380: Stripe がサブスクリプションを解約した会員（canceled のみ）は利用停止
  it("サブスクリプションが canceled だけの入会済みの会員は、利用停止を返す", async () => {
    await expect(service.findMemberStatus(CLERK_CANCELED)).resolves.toEqual({
      onboardingCompleted: true,
      withdrawn: false,
      subscriptionEnded: true,
    });
  });

  it("支払い失敗中（past_due）の会員は、利用停止でないを返す", async () => {
    await expect(service.findMemberStatus(CLERK_PAST_DUE)).resolves.toEqual({
      onboardingCompleted: true,
      withdrawn: false,
      subscriptionEnded: false,
    });
  });

  it("解約済みの行と有効な行がある会員は、利用停止でないを返す", async () => {
    await expect(service.findMemberStatus(CLERK_RECONTRACTED)).resolves.toEqual(
      {
        onboardingCompleted: true,
        withdrawn: false,
        subscriptionEnded: false,
      }
    );
  });

  it("サブスクリプションの行が無い入会済みの会員は、利用停止を返す", async () => {
    await expect(
      service.findMemberStatus(CLERK_NO_SUBSCRIPTION)
    ).resolves.toEqual({
      onboardingCompleted: true,
      withdrawn: false,
      subscriptionEnded: true,
    });
  });

  it("行が無い会員は null を返す", async () => {
    await expect(service.findMemberStatus(CLERK_MISSING)).resolves.toBeNull();
  });
});

describe("memberStatusQueryService（組み立て）", () => {
  it("service_role のクライアントで会員の状態を取得できる", async () => {
    const service = memberStatusQueryService();
    await expect(service.findMemberStatus(CLERK_ACTIVE_ONLY)).resolves.toEqual({
      onboardingCompleted: true,
      withdrawn: false,
      subscriptionEnded: false,
    });
  });
});
