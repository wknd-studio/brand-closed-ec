import { describe, it, expect, vi } from "vitest";
import { completeSubscriptionOnboarding } from "@/use-cases/complete-subscription-onboarding";
import type { SubscriptionOnboardingRepository } from "@/repositories/subscription-onboarding-repository";
import { makeUserRepo, makeAccountGateway, makeUser } from "./helpers";

const subscriptionInput = {
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
  status: "active" as const,
  currentPeriodStart: new Date(2026, 0, 1),
  currentPeriodEnd: new Date(2026, 1, 1),
};

function makeOnboardingRepo(): SubscriptionOnboardingRepository {
  return { confirm: vi.fn().mockResolvedValue(undefined) };
}

describe("completeSubscriptionOnboarding", () => {
  it("userが見つからない場合はエラーをthrowする", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const onboardingRepo = makeOnboardingRepo();

    await expect(
      completeSubscriptionOnboarding(
        { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
        { userRepo, onboardingRepo, accountGateway: makeAccountGateway() }
      )
    ).rejects.toThrow("ユーザーが見つかりません");
    expect(onboardingRepo.confirm).not.toHaveBeenCalled();
  });

  it("選んだランク・Stripe情報・課金基準日で入会の確定を1回の呼び出しで行う", async () => {
    const user = makeUser({ rank: "starter", onboardingCompleted: false });
    const onboardingRepo = makeOnboardingRepo();

    await completeSubscriptionOnboarding(
      { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
      {
        userRepo: makeUserRepo(user),
        onboardingRepo,
        accountGateway: makeAccountGateway(),
      }
    );

    expect(onboardingRepo.confirm).toHaveBeenCalledTimes(1);
    const input = vi.mocked(onboardingRepo.confirm).mock.calls[0][0];
    expect(input).toEqual({
      userId: user.id,
      rank: "basic",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "active",
      currentPeriodStart: subscriptionInput.currentPeriodStart,
      currentPeriodEnd: subscriptionInput.currentPeriodEnd,
      billingAnchorDay: expect.any(Number),
    });
    expect(input.billingAnchorDay).toBeGreaterThanOrEqual(1);
    expect(input.billingAnchorDay).toBeLessThanOrEqual(28);
  });

  it("入会の確定後にaccountGateway.updateOnboardingMetadataをtrueで呼ぶ", async () => {
    const onboardingRepo = makeOnboardingRepo();
    const accountGateway = makeAccountGateway();

    await completeSubscriptionOnboarding(
      { clerkUserId: "clerk-1", plan: "standard", ...subscriptionInput },
      {
        userRepo: makeUserRepo(
          makeUser({ rank: "starter", onboardingCompleted: false })
        ),
        onboardingRepo,
        accountGateway,
      }
    );

    expect(accountGateway.updateOnboardingMetadata).toHaveBeenCalledWith(
      "clerk-1",
      true
    );
    expect(
      vi.mocked(onboardingRepo.confirm).mock.invocationCallOrder[0]
    ).toBeLessThan(
      vi.mocked(accountGateway.updateOnboardingMetadata).mock
        .invocationCallOrder[0]
    );
  });

  it("入会の確定に失敗したらClerkのmetadataを更新せずにエラーを返す（再送で最初からやり直せる）", async () => {
    const onboardingRepo = makeOnboardingRepo();
    vi.mocked(onboardingRepo.confirm).mockRejectedValue(new Error("DB error"));
    const accountGateway = makeAccountGateway();

    await expect(
      completeSubscriptionOnboarding(
        { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
        {
          userRepo: makeUserRepo(
            makeUser({ rank: "starter", onboardingCompleted: false })
          ),
          onboardingRepo,
          accountGateway,
        }
      )
    ).rejects.toThrow("DB error");
    expect(accountGateway.updateOnboardingMetadata).not.toHaveBeenCalled();
  });

  it("onboarding_completed済みの会員への再配信でも確定処理に委ね、Clerkのmetadataを更新し直す（前回Clerk更新だけ失敗した場合の回復）", async () => {
    // 冪等性（同じstripe_subscription_idの行が既にあれば何もしない）は
    // 入会確定のRPCが担うため、use case側ではonboarding_completedで早期returnしない
    const onboardingRepo = makeOnboardingRepo();
    const accountGateway = makeAccountGateway();

    await completeSubscriptionOnboarding(
      { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
      {
        userRepo: makeUserRepo(makeUser({ onboardingCompleted: true })),
        onboardingRepo,
        accountGateway,
      }
    );

    expect(onboardingRepo.confirm).toHaveBeenCalledTimes(1);
    expect(accountGateway.updateOnboardingMetadata).toHaveBeenCalledWith(
      "clerk-1",
      true
    );
  });
});
