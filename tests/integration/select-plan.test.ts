import { describe, it, expect, vi, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { SupabaseUserRepository } from "@/infrastructure/supabase/supabase-user-repository";
import { selectPlan } from "@/use-cases/select-plan";
import type { AccountGateway } from "@/repositories/account-gateway";
import { OnboardingAlreadyCompletedError } from "@/domain/errors/onboarding-already-completed-error";

const supabase = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

const TEST_CLERK_ID = "clerk_test_select_plan_infra";
const RACE_CLERK_ID = "clerk_test_select_plan_infra_race";

function makeAccountGateway(): AccountGateway {
  return {
    deleteUser: vi.fn().mockResolvedValue(undefined),
    updateOnboardingMetadata: vi.fn().mockResolvedValue(undefined),
    disableSelfDelete: vi.fn().mockResolvedValue(undefined),
  };
}

afterAll(async () => {
  await supabase
    .from("users")
    .delete()
    .in("clerk_user_id", [TEST_CLERK_ID, RACE_CLERK_ID]);
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

  it("確認の後に入会済みに変わった行は保存せず、OnboardingAlreadyCompletedErrorにしてDBとClerkのmetadataを変更しない", async () => {
    await supabase.from("users").delete().eq("clerk_user_id", RACE_CLERK_ID);
    const input = {
      clerkUserId: RACE_CLERK_ID,
      email: "race@example.com",
      firstName: "テスト",
      lastName: "競合",
      phoneNumber: "09012345678",
      plan: "starter" as const,
    };
    await selectPlan(input, { userRepo, accountGateway: makeAccountGateway() });

    // selectPlanが未入会の行を読み取った直後に、別のタブの決済で入会のWebhookが
    // onboarding_completed=trueを書いたケース
    const racingRepo = new SupabaseUserRepository(supabase);
    const findOriginal = racingRepo.findByClerkUserId.bind(racingRepo);
    racingRepo.findByClerkUserId = async (clerkUserId) => {
      const found = await findOriginal(clerkUserId);
      await supabase
        .from("users")
        .update({ onboarding_completed: true })
        .eq("clerk_user_id", clerkUserId)
        .is("deleted_at", null);
      return found;
    };
    const accountGateway = makeAccountGateway();

    await expect(
      selectPlan(
        { ...input, plan: "premium" },
        { userRepo: racingRepo, accountGateway }
      )
    ).rejects.toThrow(OnboardingAlreadyCompletedError);

    const { data: rows } = await supabase
      .from("users")
      .select("rank_code, onboarding_completed")
      .eq("clerk_user_id", RACE_CLERK_ID);
    expect(rows).toEqual([
      { rank_code: "starter", onboarding_completed: true },
    ]);
    expect(accountGateway.updateOnboardingMetadata).not.toHaveBeenCalled();
  });
});
