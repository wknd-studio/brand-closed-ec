import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { MemberRank } from "@/domain/value-objects/member-rank";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_USER_ID = "00000000-0000-0000-0000-000000000010";
const TEST_CLERK_ID = "clerk_test_infra_001";
// 退会済み行と有効な行が併存するケース（clerk_user_idの一意制約は deleted_at IS NULL の部分インデックス）
const COEXIST_CLERK_ID = "clerk_test_infra_coexist";
const COEXIST_WITHDRAWN_ID = "00000000-0000-0000-0000-000000000011";
const COEXIST_ACTIVE_ID = "00000000-0000-0000-0000-000000000012";
const WITHDRAWN_ONLY_CLERK_ID = "clerk_test_infra_withdrawn_only";
const WITHDRAWN_ONLY_ID = "00000000-0000-0000-0000-000000000013";
const FIXTURE_IDS = [
  TEST_USER_ID,
  COEXIST_WITHDRAWN_ID,
  COEXIST_ACTIVE_ID,
  WITHDRAWN_ONLY_ID,
];

function userRow(id: string, clerkUserId: string, deletedAt: string | null) {
  return {
    id,
    clerk_user_id: clerkUserId,
    email: `${id}@example.com`,
    first_name: "インフラ",
    last_name: "テスト",
    rank_code: "basic",
    onboarding_completed: true,
    billing_anchor_day: 10,
    deleted_at: deletedAt,
  };
}

beforeAll(async () => {
  await supabase.from("users").delete().in("id", FIXTURE_IDS);
  const { error } = await supabase
    .from("users")
    .insert([
      userRow(COEXIST_WITHDRAWN_ID, COEXIST_CLERK_ID, "2026-06-01T00:00:00Z"),
      userRow(COEXIST_ACTIVE_ID, COEXIST_CLERK_ID, null),
      userRow(
        WITHDRAWN_ONLY_ID,
        WITHDRAWN_ONLY_CLERK_ID,
        "2026-06-01T00:00:00Z"
      ),
    ]);
  if (error) throw error;
  await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: TEST_CLERK_ID,
    email: "infra-test@example.com",
    first_name: "インフラ",
    last_name: "テスト",
    rank_code: "basic",
    onboarding_completed: true,
    billing_anchor_day: 10,
  });
});

afterAll(async () => {
  await supabase.from("users").delete().in("id", FIXTURE_IDS);
});

describe("SupabaseUserRepository", () => {
  const repo = new SupabaseUserRepository(supabase);

  describe("findByClerkUserId()", () => {
    it("存在するユーザーを返す", async () => {
      const user = await repo.findByClerkUserId(TEST_CLERK_ID);
      expect(user).not.toBeNull();
      expect(user!.id).toBe(TEST_USER_ID);
      expect(user!.email).toBe("infra-test@example.com");
      expect(user!.rank.value).toBe("basic");
    });

    it("存在しないユーザーは null を返す", async () => {
      const user = await repo.findByClerkUserId("clerk_nonexistent");
      expect(user).toBeNull();
    });

    it("退会済み行と有効な行が併存する場合は有効な行を返す", async () => {
      const user = await repo.findByClerkUserId(COEXIST_CLERK_ID);
      expect(user?.id).toBe(COEXIST_ACTIVE_ID);
      expect(user?.isWithdrawn()).toBe(false);
    });

    it("退会済み行しか無い場合は退会済みのユーザーを返す", async () => {
      const user = await repo.findByClerkUserId(WITHDRAWN_ONLY_CLERK_ID);
      expect(user?.id).toBe(WITHDRAWN_ONLY_ID);
      expect(user?.isWithdrawn()).toBe(true);
    });
  });

  describe("findById()", () => {
    it("存在するユーザーを返す", async () => {
      const user = await repo.findById(TEST_USER_ID);
      expect(user).not.toBeNull();
      expect(user!.clerkUserId).toBe(TEST_CLERK_ID);
    });

    it("存在しないユーザーは null を返す", async () => {
      const user = await repo.findById("00000000-0000-0000-0000-000000000000");
      expect(user).toBeNull();
    });
  });

  describe("save()", () => {
    it("ランクを更新できる", async () => {
      const user = await repo.findById(TEST_USER_ID);
      await repo.save(user!.with({ rank: MemberRank.of("standard") }));

      const reloaded = await repo.findById(TEST_USER_ID);
      expect(reloaded!.rank.value).toBe("standard");
    });
  });
});
