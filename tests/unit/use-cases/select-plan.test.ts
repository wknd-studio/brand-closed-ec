import { describe, it, expect, vi } from "vitest";
import { selectPlan } from "@/use-cases/select-plan";
import {
  makeUserRepo,
  makeAccountGateway,
  makeUser,
  makeOrganizationRepo,
  makeOrganization,
} from "./helpers";

const baseInput = {
  clerkUserId: "clerk-1",
  email: "test@example.com",
  firstName: "太郎",
  lastName: "山田",
  termsVersion: "2026-05-25",
};

describe("selectPlan", () => {
  it("プランを選択した場合: onboarding_completed=false で /onboarding/payment にリダイレクト", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const accountGateway = makeAccountGateway();

    const result = await selectPlan(
      { ...baseInput, plan: "starter" },
      { userRepo, accountGateway }
    );

    expect(result).toEqual({ redirectTo: "/onboarding/payment?plan=starter" });
    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(saved.rank.value).toBe("starter");
    expect(saved.onboardingCompleted).toBe(false);
    expect(saved.termsVersion).toBe("2026-05-25");
    expect(accountGateway.updateOnboardingMetadata).toHaveBeenCalledWith(
      "clerk-1",
      false
    );
  });

  it("既存userが存在する場合: rankを上書きして保存する", async () => {
    const existingUser = makeUser({ rank: "starter" });
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

  it("organizationIdが指定された場合: organizationのrank/onboarding_completedを更新し/へリダイレクト", async () => {
    const organization = makeOrganization({ rank: "starter" });
    const organizationRepo = makeOrganizationRepo(organization);
    const userRepo = makeUserRepo();
    const accountGateway = makeAccountGateway();

    const result = await selectPlan(
      { ...baseInput, plan: "advanced", organizationId: organization.id },
      { userRepo, accountGateway, organizationRepo }
    );

    expect(result).toEqual({ redirectTo: "/" });
    const savedOrg = vi.mocked(organizationRepo.save).mock.calls[0][0];
    expect(savedOrg.rank.value).toBe("advanced");
    expect(savedOrg.onboardingCompleted).toBe(true);
    expect(userRepo.save).toHaveBeenCalled();
    const savedUser = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(savedUser.onboardingCompleted).toBe(true);
  });

  it("organizationIdが指定されているのにorganizationRepoが無い場合はエラー", async () => {
    await expect(
      selectPlan(
        { ...baseInput, plan: "advanced", organizationId: "org-1" },
        { userRepo: makeUserRepo(), accountGateway: makeAccountGateway() }
      )
    ).rejects.toThrow("organizationRepoが指定されていません");
  });
});
