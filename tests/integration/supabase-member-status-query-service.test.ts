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
const ALL_USER_IDS = [
  ACTIVE_ONLY_ID,
  WITHDRAWN_ONLY_ID,
  COEXIST_WITHDRAWN_ID,
  COEXIST_ACTIVE_ID,
  NOT_ONBOARDED_ID,
];

const CLERK_ACTIVE_ONLY = "clerk_test_member_status_active";
const CLERK_WITHDRAWN_ONLY = "clerk_test_member_status_withdrawn";
const CLERK_COEXIST = "clerk_test_member_status_coexist";
const CLERK_NOT_ONBOARDED = "clerk_test_member_status_not_onboarded";
const CLERK_MISSING = "clerk_test_member_status_missing";

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

async function cleanup() {
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
  ]);
  if (error) throw error;
});

afterAll(cleanup);

describe("SupabaseMemberStatusQueryService.findMemberStatus", () => {
  const service = new SupabaseMemberStatusQueryService(supabase);

  it("有効な行だけがある会員は、入会済み・退会していないを返す", async () => {
    await expect(service.findMemberStatus(CLERK_ACTIVE_ONLY)).resolves.toEqual({
      onboardingCompleted: true,
      withdrawn: false,
    });
  });

  it("有効な行が入会未完了の会員は、入会未完了を返す", async () => {
    await expect(
      service.findMemberStatus(CLERK_NOT_ONBOARDED)
    ).resolves.toEqual({ onboardingCompleted: false, withdrawn: false });
  });

  it("退会済みの行だけがある会員は、退会済みを返す", async () => {
    await expect(
      service.findMemberStatus(CLERK_WITHDRAWN_ONLY)
    ).resolves.toEqual({ onboardingCompleted: true, withdrawn: true });
  });

  it("退会済みの行と有効な行が併存する会員は、有効な行を返す", async () => {
    await expect(service.findMemberStatus(CLERK_COEXIST)).resolves.toEqual({
      onboardingCompleted: false,
      withdrawn: false,
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
    });
  });
});
