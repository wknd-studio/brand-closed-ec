import { describe, it, expect, vi } from "vitest";
import { completeOrganizationSubscriptionOnboarding } from "@/use-cases/complete-organization-subscription-onboarding";
import {
  makeUserRepo,
  makeAccountGateway,
  makeUser,
  makeOrganizationRepo,
  makeOrganization,
  makeSubscriptionRepo,
} from "./helpers";

function baseInput() {
  return {
    organizationId: "00000000-0000-0000-0000-000000000101",
    clerkUserId: "clerk-1",
    plan: "basic" as const,
    stripeCustomerId: "cus_1",
    stripeSubscriptionId: "sub_1",
    status: "active" as const,
    currentPeriodStart: new Date(2026, 0, 1),
    currentPeriodEnd: new Date(2026, 1, 1),
  };
}

describe("completeOrganizationSubscriptionOnboarding", () => {
  it("組織が見つからない場合はエラーをthrowする", async () => {
    const organizationRepo = makeOrganizationRepo(null);

    await expect(
      completeOrganizationSubscriptionOnboarding(baseInput(), {
        organizationRepo,
        userRepo: makeUserRepo(),
        subscriptionRepo: makeSubscriptionRepo(),
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
    const subscriptionRepo = makeSubscriptionRepo();
    const accountGateway = makeAccountGateway();

    await completeOrganizationSubscriptionOnboarding(baseInput(), {
      organizationRepo,
      userRepo,
      subscriptionRepo,
      accountGateway,
    });

    const savedOrg = vi.mocked(organizationRepo.save).mock.calls[0][0];
    expect(savedOrg.rank.value).toBe("basic");
    expect(savedOrg.stripeCustomerId).toBe("cus_1");
    expect(savedOrg.onboardingCompleted).toBe(true);
    expect(savedOrg.billingAnchorDay).not.toBeNull();

    expect(subscriptionRepo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: organization.id,
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        status: "active",
        rank: "basic",
      })
    );

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
    const subscriptionRepo = makeSubscriptionRepo();
    const accountGateway = makeAccountGateway();

    await completeOrganizationSubscriptionOnboarding(baseInput(), {
      organizationRepo,
      userRepo,
      subscriptionRepo,
      accountGateway,
    });

    expect(organizationRepo.save).not.toHaveBeenCalled();
    expect(subscriptionRepo.upsert).not.toHaveBeenCalled();
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(accountGateway.updateOnboardingMetadata).not.toHaveBeenCalled();
  });
});
