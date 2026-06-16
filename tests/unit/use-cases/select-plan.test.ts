import { describe, it, expect, vi } from "vitest";
import { selectPlan } from "@/use-cases/select-plan";
import { makeUserRepo, makeAccountGateway, makeUser } from "./helpers";

const baseInput = {
  clerkUserId: "clerk-1",
  email: "test@example.com",
  firstName: "太郎",
  lastName: "山田",
  termsVersion: "2026-05-25",
};

describe("selectPlan", () => {
  it("freeプランを選択した場合: onboarding_completed=true で /shop にリダイレクト", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const accountGateway = makeAccountGateway();

    const result = await selectPlan(
      { ...baseInput, plan: "free" },
      { userRepo, accountGateway }
    );

    expect(result).toEqual({ redirectTo: "/shop" });
    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(saved.rank.value).toBe("free");
    expect(saved.onboardingCompleted).toBe(true);
    expect(saved.termsVersion).toBe("2026-05-25");
    expect(accountGateway.updateOnboardingMetadata).toHaveBeenCalledWith(
      "clerk-1",
      true
    );
  });

  it("entryプランを選択した場合: onboarding_completed=false で /onboarding/payment にリダイレクト", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const accountGateway = makeAccountGateway();

    const result = await selectPlan(
      { ...baseInput, plan: "entry" },
      { userRepo, accountGateway }
    );

    expect(result).toEqual({ redirectTo: "/onboarding/payment?plan=entry" });
    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(saved.rank.value).toBe("entry");
    expect(saved.onboardingCompleted).toBe(false);
    expect(accountGateway.updateOnboardingMetadata).toHaveBeenCalledWith(
      "clerk-1",
      false
    );
  });

  it("既存userが存在する場合: rankを上書きして保存する", async () => {
    const existingUser = makeUser({ rank: "free" });
    const userRepo = makeUserRepo(existingUser);
    const accountGateway = makeAccountGateway();

    await selectPlan(
      { ...baseInput, plan: "standard" },
      { userRepo, accountGateway }
    );

    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(saved.id).toBe(existingUser.id);
    expect(saved.rank.value).toBe("standard");
  });
});
