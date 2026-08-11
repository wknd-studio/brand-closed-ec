import { describe, it, expect, vi, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { selectPlan } from "@/use-cases/select-plan";
import type { AccountGateway } from "@/repositories/account-gateway";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_CLERK_ID = "clerk_test_select_plan_infra";

function makeAccountGateway(): AccountGateway {
  return {
    deleteUser: vi.fn().mockResolvedValue(undefined),
    updateOnboardingMetadata: vi.fn().mockResolvedValue(undefined),
  };
}

afterAll(async () => {
  await supabase.from("users").delete().eq("clerk_user_id", TEST_CLERK_ID);
});

describe("selectPlan（実DB）", () => {
  const userRepo = new SupabaseUserRepository(supabase);

  it("7ランクのいずれでも新規会員として登録できる", async () => {
    for (const plan of [
      "starter",
      "basic",
      "standard",
      "pro",
      "advanced",
      "premium",
    ] as const) {
      const clerkUserId = `${TEST_CLERK_ID}_${plan}`;
      await supabase.from("users").delete().eq("clerk_user_id", clerkUserId);

      await selectPlan(
        {
          clerkUserId,
          email: `${plan}@example.com`,
          firstName: "テスト",
          lastName: plan,
          phoneNumber: "09012345678",
          plan,
        },
        { userRepo, accountGateway: makeAccountGateway() }
      );

      const saved = await userRepo.findByClerkUserId(clerkUserId);
      expect(saved).not.toBeNull();
      expect(saved!.rank.value).toBe(plan);
      expect(saved!.onboardingCompleted).toBe(false);

      await supabase.from("users").delete().eq("clerk_user_id", clerkUserId);
    }
  });

  it("既存会員のランクを上書きして保存する", async () => {
    await selectPlan(
      {
        clerkUserId: TEST_CLERK_ID,
        email: "initial@example.com",
        firstName: "テスト",
        lastName: "初回",
        phoneNumber: "09012345678",
        plan: "starter",
      },
      { userRepo, accountGateway: makeAccountGateway() }
    );

    await selectPlan(
      {
        clerkUserId: TEST_CLERK_ID,
        email: "initial@example.com",
        firstName: "テスト",
        lastName: "初回",
        phoneNumber: "09012345678",
        plan: "premium",
      },
      { userRepo, accountGateway: makeAccountGateway() }
    );

    const saved = await userRepo.findByClerkUserId(TEST_CLERK_ID);
    expect(saved!.rank.value).toBe("premium");
  });
});
