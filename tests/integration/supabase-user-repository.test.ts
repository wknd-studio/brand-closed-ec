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

beforeAll(async () => {
  await supabase.from("users").delete().eq("id", TEST_USER_ID);
  await supabase.from("users").insert({
    id: TEST_USER_ID,
    clerk_user_id: TEST_CLERK_ID,
    email: "infra-test@example.com",
    first_name: "インフラ",
    last_name: "テスト",
    rank: "basic",
    onboarding_completed: true,
    subscribed_at: "2026-01-10T00:00:00.000Z",
    terms_agreed_at: "2026-01-10T00:00:00.000Z",
    terms_version: "v1",
  });
});

afterAll(async () => {
  await supabase.from("users").delete().eq("id", TEST_USER_ID);
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
