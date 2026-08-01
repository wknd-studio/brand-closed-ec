import { describe, it, expect, vi } from "vitest";
import { completeSubscriptionOnboarding } from "@/use-cases/complete-subscription-onboarding";
import { makeUserRepo, makeAccountGateway, makeUser } from "./helpers";

describe("completeSubscriptionOnboarding", () => {
  it("userが見つからない場合はエラーをthrowする", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);

    await expect(
      completeSubscriptionOnboarding(
        {
          clerkUserId: "clerk-1",
          plan: "basic",
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
        },
        { userRepo, accountGateway: makeAccountGateway() }
      )
    ).rejects.toThrow("ユーザーが見つかりません");
  });

  it("rankとStripe情報とonboarding_completedを更新する", async () => {
    const user = makeUser({ rank: "starter", onboardingCompleted: false });
    const userRepo = makeUserRepo(user);
    const accountGateway = makeAccountGateway();

    await completeSubscriptionOnboarding(
      {
        clerkUserId: "clerk-1",
        plan: "basic",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
      },
      { userRepo, accountGateway }
    );

    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(saved.rank.value).toBe("basic");
    expect(saved.stripeCustomerId).toBe("cus_1");
    expect(saved.stripeSubscriptionId).toBe("sub_1");
    expect(saved.onboardingCompleted).toBe(true);
    expect(saved.subscribedAt).not.toBeNull();
  });

  it("accountGateway.updateOnboardingMetadataをtrueで呼ぶ", async () => {
    const userRepo = makeUserRepo(
      makeUser({ rank: "starter", onboardingCompleted: false })
    );
    const accountGateway = makeAccountGateway();

    await completeSubscriptionOnboarding(
      {
        clerkUserId: "clerk-1",
        plan: "standard",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
      },
      { userRepo, accountGateway }
    );

    expect(accountGateway.updateOnboardingMetadata).toHaveBeenCalledWith(
      "clerk-1",
      true
    );
  });

  it("既にonboarding完了済みの場合は何もしない（Webhook再配信時の冪等性）", async () => {
    const originalSubscribedAt = new Date(2026, 0, 15);
    const user = makeUser({
      onboardingCompleted: true,
      subscribedAt: originalSubscribedAt,
    });
    const userRepo = makeUserRepo(user);
    const accountGateway = makeAccountGateway();

    await completeSubscriptionOnboarding(
      {
        clerkUserId: "clerk-1",
        plan: "basic",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
      },
      { userRepo, accountGateway }
    );

    expect(userRepo.save).not.toHaveBeenCalled();
    expect(accountGateway.updateOnboardingMetadata).not.toHaveBeenCalled();
  });
});
