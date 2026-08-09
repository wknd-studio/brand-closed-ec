import { describe, it, expect, vi } from "vitest";
import { completeOrganizationSubscriptionOnboarding } from "@/use-cases/complete-organization-subscription-onboarding";
import {
  makeUserRepo,
  makeAccountGateway,
  makeUser,
  makeOrganizationRepo,
  makeOrganization,
} from "./helpers";

function baseInput() {
  return {
    organizationId: "00000000-0000-0000-0000-000000000101",
    clerkUserId: "clerk-1",
    plan: "basic" as const,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
  };
}

describe("completeOrganizationSubscriptionOnboarding", () => {
  it("組織が見つからない場合はエラーをthrowする", async () => {
    const organizationRepo = makeOrganizationRepo(null);

    await expect(
      completeOrganizationSubscriptionOnboarding(baseInput(), {
        organizationRepo,
        userRepo: makeUserRepo(),
        accountGateway: makeAccountGateway(),
      })
    ).rejects.toThrow("組織が見つかりません");
  });

  it("rankとStripe情報とonboarding_completedを組織に反映し、代表者のonboarding_completedも更新する", async () => {
    const organization = makeOrganization({ rank: "starter" }).with({
      onboardingCompleted: false,
    });
    const organizationRepo = makeOrganizationRepo(organization);
    const user = makeUser({ onboardingCompleted: false });
    const userRepo = makeUserRepo(user);
    const accountGateway = makeAccountGateway();

    await completeOrganizationSubscriptionOnboarding(baseInput(), {
      organizationRepo,
      userRepo,
      accountGateway,
    });

    const savedOrg = vi.mocked(organizationRepo.save).mock.calls[0][0];
    expect(savedOrg.rank.value).toBe("basic");
    expect(savedOrg.stripeCustomerId).toBe("cus_1");
    expect(savedOrg.stripeSubscriptionId).toBe("sub_1");
    expect(savedOrg.onboardingCompleted).toBe(true);

    const savedUser = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(savedUser.onboardingCompleted).toBe(true);
    expect(accountGateway.updateOnboardingMetadata).toHaveBeenCalledWith(
      "clerk-1",
      true
    );
  });

  it("既にonboarding完了済みの組織の場合は何もしない（Webhook再配信時の冪等性）", async () => {
    const organization = makeOrganization({ rank: "basic" });
    const alreadyCompleted = organization.with({ onboardingCompleted: true });
    const organizationRepo = makeOrganizationRepo(alreadyCompleted);
    const userRepo = makeUserRepo();
    const accountGateway = makeAccountGateway();

    await completeOrganizationSubscriptionOnboarding(baseInput(), {
      organizationRepo,
      userRepo,
      accountGateway,
    });

    expect(organizationRepo.save).not.toHaveBeenCalled();
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(accountGateway.updateOnboardingMetadata).not.toHaveBeenCalled();
  });
});
