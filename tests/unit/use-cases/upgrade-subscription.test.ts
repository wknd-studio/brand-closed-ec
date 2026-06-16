import { describe, it, expect, vi } from "vitest";
import { upgradeSubscription } from "@/use-cases/upgrade-subscription";
import { makeUserRepo, makeAccountGateway, makeUser } from "./helpers";

describe("upgradeSubscription", () => {
  it("userが見つからない場合はエラーをthrowする", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);

    await expect(
      upgradeSubscription(
        {
          clerkUserId: "clerk-1",
          plan: "entry",
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
        },
        { userRepo, accountGateway: makeAccountGateway() }
      )
    ).rejects.toThrow("ユーザーが見つかりません");
  });

  it("rankとStripe情報とonboarding_completedを更新する", async () => {
    const user = makeUser({ rank: "free" });
    const userRepo = makeUserRepo(user);
    const accountGateway = makeAccountGateway();

    await upgradeSubscription(
      {
        clerkUserId: "clerk-1",
        plan: "entry",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
      },
      { userRepo, accountGateway }
    );

    const saved = vi.mocked(userRepo.save).mock.calls[0][0];
    expect(saved.rank.value).toBe("entry");
    expect(saved.stripeCustomerId).toBe("cus_1");
    expect(saved.stripeSubscriptionId).toBe("sub_1");
    expect(saved.onboardingCompleted).toBe(true);
    expect(saved.subscribedAt).not.toBeNull();
  });

  it("accountGateway.updateOnboardingMetadataをtrueで呼ぶ", async () => {
    const userRepo = makeUserRepo(makeUser({ rank: "free" }));
    const accountGateway = makeAccountGateway();

    await upgradeSubscription(
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
});
