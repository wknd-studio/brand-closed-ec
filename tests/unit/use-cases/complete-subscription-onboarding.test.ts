import { describe, it, expect, vi } from "vitest";
import { completeSubscriptionOnboarding } from "@/use-cases/complete-subscription-onboarding";
import type { SubscriptionOnboardingRepository } from "@/repositories/subscription-onboarding-repository";
import type { OnboardingCheckoutGateway } from "@/repositories/onboarding-checkout-gateway";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { MinimumMembershipPeriod } from "@/domain/value-objects/minimum-membership-period";
import { Money } from "@/domain/value-objects/money";
import { MonthlyLimit } from "@/domain/value-objects/monthly-limit";
import {
  makeUserRepo,
  makeAccountGateway,
  makeUser,
  makeErrorReporter,
  makeMemberRankRepo,
  makeNotificationService,
} from "./helpers";

const subscriptionInput = {
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
  status: "active" as const,
  currentPeriodStart: new Date(2026, 0, 1),
  currentPeriodEnd: new Date(2026, 1, 1),
  // JST 2026-01-01 10:00
  subscriptionStartedAt: new Date("2026-01-01T01:00:00Z"),
  stripeCheckoutSessionId: "cs_1",
};

function makeOnboardingRepo(): SubscriptionOnboardingRepository {
  return { confirm: vi.fn().mockResolvedValue("confirmed") };
}

function makeCheckoutGateway(): OnboardingCheckoutGateway {
  return {
    createCustomer: vi.fn(),
    hasActiveSubscription: vi.fn(),
    createCheckoutSession: vi.fn(),
    retrieveCheckoutCharge: vi.fn().mockResolvedValue({
      initialFee: Money.of(10_000),
      monthlyFee: Money.of(10_000),
    }),
  };
}

// 入会の完了のメール（#852）に使う依存
function welcomeDeps() {
  return {
    checkoutGateway: makeCheckoutGateway(),
    memberRankRepo: makeMemberRankRepo(MonthlyLimit.of(1_000_000)),
    notificationService: makeNotificationService(),
    errorReporter: makeErrorReporter(),
  };
}

describe("completeSubscriptionOnboarding", () => {
  it("有効な会員が見つからない（退会済み・users行が無い）場合は、確定もClerkの更新もせずにmember_not_foundを返す", async () => {
    const userRepo = makeUserRepo();
    vi.mocked(userRepo.findByClerkUserId).mockResolvedValue(null);
    const onboardingRepo = makeOnboardingRepo();
    const accountGateway = makeAccountGateway();

    await expect(
      completeSubscriptionOnboarding(
        { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
        { userRepo, onboardingRepo, accountGateway, ...welcomeDeps() }
      )
    ).resolves.toBe("member_not_found");
    expect(onboardingRepo.confirm).not.toHaveBeenCalled();
    expect(accountGateway.updateOnboardingMetadata).not.toHaveBeenCalled();
  });

  it("確定の中で会員が見つからなかった（読み取りのあとに退会した）場合は、Clerkを更新せずにmember_not_foundを返す", async () => {
    const onboardingRepo = makeOnboardingRepo();
    vi.mocked(onboardingRepo.confirm).mockResolvedValue("member_not_found");
    const accountGateway = makeAccountGateway();

    await expect(
      completeSubscriptionOnboarding(
        { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
        {
          userRepo: makeUserRepo(makeUser({ onboardingCompleted: false })),
          onboardingRepo,
          accountGateway,
          ...welcomeDeps(),
        }
      )
    ).resolves.toBe("member_not_found");
    expect(accountGateway.updateOnboardingMetadata).not.toHaveBeenCalled();
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
        ...welcomeDeps(),
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
      billingAnchorDay: 1,
    });
  });

  it("課金基準日は処理した時刻ではなく、サブスクリプションの開始日時のJSTの日付から決める（Webhookの再送）", async () => {
    // 開始はJST 3/1 05:00（UTCでは2/28）。Webhookの再送で処理が3/3になった
    vi.useFakeTimers({ now: new Date("2026-03-03T06:00:00Z") });
    try {
      const onboardingRepo = makeOnboardingRepo();

      await completeSubscriptionOnboarding(
        {
          clerkUserId: "clerk-1",
          plan: "basic",
          ...subscriptionInput,
          subscriptionStartedAt: new Date("2026-02-28T20:00:00Z"),
        },
        {
          userRepo: makeUserRepo(makeUser({ onboardingCompleted: false })),
          onboardingRepo,
          accountGateway: makeAccountGateway(),
          ...welcomeDeps(),
        }
      );

      expect(
        vi.mocked(onboardingRepo.confirm).mock.calls[0][0].billingAnchorDay
      ).toBe(1);
    } finally {
      vi.useRealTimers();
    }
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
        ...welcomeDeps(),
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
          ...welcomeDeps(),
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
        ...welcomeDeps(),
      }
    );

    expect(onboardingRepo.confirm).toHaveBeenCalledTimes(1);
    expect(accountGateway.updateOnboardingMetadata).toHaveBeenCalledWith(
      "clerk-1",
      true
    );
  });

  it("確定した・確定済みだった結果をそのまま返す", async () => {
    for (const result of ["confirmed", "already_confirmed"] as const) {
      const onboardingRepo = makeOnboardingRepo();
      vi.mocked(onboardingRepo.confirm).mockResolvedValue(result);

      await expect(
        completeSubscriptionOnboarding(
          { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
          {
            userRepo: makeUserRepo(makeUser({ onboardingCompleted: false })),
            onboardingRepo,
            accountGateway: makeAccountGateway(),
            ...welcomeDeps(),
          }
        )
      ).resolves.toBe(result);
    }
  });

  it("入会済みの会員に別のサブスクリプションが届いた場合は、Clerkのmetadataを更新せずにその結果を返す", async () => {
    const onboardingRepo = makeOnboardingRepo();
    vi.mocked(onboardingRepo.confirm).mockResolvedValue(
      "conflicting_subscription"
    );
    const accountGateway = makeAccountGateway();

    await expect(
      completeSubscriptionOnboarding(
        { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
        {
          userRepo: makeUserRepo(makeUser({ onboardingCompleted: true })),
          onboardingRepo,
          accountGateway,
          ...welcomeDeps(),
        }
      )
    ).resolves.toBe("conflicting_subscription");
    expect(accountGateway.updateOnboardingMetadata).not.toHaveBeenCalled();
  });

  // GitHub issue #852
  describe("入会の完了のメール", () => {
    // users.created_at（最低利用期間の起点）: JST 2026-11-28
    const createdAt = new Date("2026-11-28T03:00:00Z");

    function setup(
      result: Awaited<
        ReturnType<typeof completeSubscriptionOnboarding>
      > = "confirmed"
    ) {
      const user = makeUser({ onboardingCompleted: false, createdAt });
      const onboardingRepo = makeOnboardingRepo();
      vi.mocked(onboardingRepo.confirm).mockResolvedValue(result);
      const deps = {
        userRepo: makeUserRepo(user),
        onboardingRepo,
        accountGateway: makeAccountGateway(),
        ...welcomeDeps(),
      };
      return { user, deps };
    }

    it("入会が確定したら、プラン・上限・支払った金額・次回の請求日・最低利用期間を添えて1回だけ送る", async () => {
      const { user, deps } = setup();

      await expect(
        completeSubscriptionOnboarding(
          { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
          deps
        )
      ).resolves.toBe("confirmed");

      expect(deps.checkoutGateway.retrieveCheckoutCharge).toHaveBeenCalledWith(
        "cs_1"
      );
      expect(deps.memberRankRepo.findMonthlyLimit).toHaveBeenCalledWith(
        MemberRank.of("basic")
      );
      expect(deps.notificationService.sendWelcome).toHaveBeenCalledTimes(1);
      expect(deps.notificationService.sendWelcome).toHaveBeenCalledWith(user, {
        rank: MemberRank.of("basic"),
        monthlyLimit: MonthlyLimit.of(1_000_000),
        initialFee: Money.of(10_000),
        monthlyFee: Money.of(10_000),
        nextPaymentAt: subscriptionInput.currentPeriodEnd,
        minimumPeriod: MinimumMembershipPeriod.startingAt(createdAt),
      });
    });

    it("Clerkの更新より先に送る（Clerkの更新だけ失敗して再送されると already_confirmed になり、送る機会が無くなるため）", async () => {
      const { deps } = setup();

      await completeSubscriptionOnboarding(
        { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
        deps
      );

      expect(
        vi.mocked(deps.notificationService.sendWelcome).mock
          .invocationCallOrder[0]
      ).toBeLessThan(
        vi.mocked(deps.accountGateway.updateOnboardingMetadata).mock
          .invocationCallOrder[0]
      );
    });

    it.each([
      "already_confirmed",
      "conflicting_subscription",
      "member_not_found",
    ] as const)(
      "確定の結果が%sなら送らない（Webhookの再配信・確定しなかった入会）",
      async (result) => {
        const { deps } = setup(result);

        await completeSubscriptionOnboarding(
          { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
          deps
        );

        expect(deps.notificationService.sendWelcome).not.toHaveBeenCalled();
        expect(
          deps.checkoutGateway.retrieveCheckoutCharge
        ).not.toHaveBeenCalled();
      }
    );

    it("送信に失敗しても入会を取り消さず、例外を通知してClerkを更新し、confirmedを返す", async () => {
      const { deps } = setup();
      const error = new Error("Resend error");
      vi.mocked(deps.notificationService.sendWelcome).mockRejectedValue(error);

      await expect(
        completeSubscriptionOnboarding(
          { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
          deps
        )
      ).resolves.toBe("confirmed");

      expect(deps.errorReporter.captureException).toHaveBeenCalledWith(error, {
        tags: { useCase: "complete-subscription-onboarding", email: "welcome" },
        extra: {
          clerkUserId: "clerk-1",
          stripeCheckoutSessionId: "cs_1",
          stripeSubscriptionId: "sub_1",
        },
      });
      expect(deps.accountGateway.updateOnboardingMetadata).toHaveBeenCalledWith(
        "clerk-1",
        true
      );
    });

    it("支払った金額の取得に失敗しても入会を取り消さず、例外を通知して送らずにconfirmedを返す", async () => {
      const { deps } = setup();
      const error = new Error("Stripe API error");
      vi.mocked(deps.checkoutGateway.retrieveCheckoutCharge).mockRejectedValue(
        error
      );

      await expect(
        completeSubscriptionOnboarding(
          { clerkUserId: "clerk-1", plan: "basic", ...subscriptionInput },
          deps
        )
      ).resolves.toBe("confirmed");

      expect(deps.errorReporter.captureException).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          tags: {
            useCase: "complete-subscription-onboarding",
            email: "welcome",
          },
        })
      );
      expect(deps.notificationService.sendWelcome).not.toHaveBeenCalled();
      expect(deps.accountGateway.updateOnboardingMetadata).toHaveBeenCalled();
    });
  });
});
