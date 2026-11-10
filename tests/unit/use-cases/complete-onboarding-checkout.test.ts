import { describe, it, expect, vi } from "vitest";
import { completeOnboardingCheckout } from "@/use-cases/complete-onboarding-checkout";
import type { StripeWebhookEventRepository } from "@/repositories/stripe-webhook-event-repository";
import type { SubscriptionOnboardingRepository } from "@/repositories/subscription-onboarding-repository";
import type { ConfirmSubscriptionOnboardingResult } from "@/repositories/subscription-onboarding-repository";
import {
  makeAccountGateway,
  makeErrorReporter,
  makeSubscriptionGateway,
  makeUser,
  makeUserRepo,
} from "./helpers";

function makeWebhookEventRepo(
  claim: "claimed" | "processing" | "processed" = "claimed"
): StripeWebhookEventRepository {
  return {
    claim: vi.fn().mockResolvedValue(claim),
    markProcessed: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
  };
}

function makeOnboardingRepo(
  result: ConfirmSubscriptionOnboardingResult = "confirmed"
): SubscriptionOnboardingRepository {
  return { confirm: vi.fn().mockResolvedValue(result) };
}

function makeDeps(
  overrides?: Partial<{
    webhookEventRepo: StripeWebhookEventRepository;
    onboardingRepo: SubscriptionOnboardingRepository;
  }>
) {
  return {
    webhookEventRepo: overrides?.webhookEventRepo ?? makeWebhookEventRepo(),
    errorReporter: makeErrorReporter(),
    subscriptionGateway: makeSubscriptionGateway(),
    userRepo: makeUserRepo(makeUser({ onboardingCompleted: false })),
    onboardingRepo: overrides?.onboardingRepo ?? makeOnboardingRepo(),
    accountGateway: makeAccountGateway(),
  };
}

const EVENT = {
  eventId: "evt_1",
  type: "checkout.session.completed",
  payload: { id: "evt_1" },
};
const TAGS = { webhook: "stripe", eventType: "checkout.session.completed" };

const INPUT = {
  event: EVENT,
  stripeCheckoutSessionId: "cs_1",
  metadata: { clerk_user_id: "clerk-1", plan: "basic" },
  paymentStatus: "paid",
  stripeCustomerId: "cus_1",
  stripeSubscriptionId: "sub_1",
};

// GitHub issue #572
describe("completeOnboardingCheckout", () => {
  it.each([
    ["metadataが無い", null],
    ["clerk_user_idが無い", { plan: "basic" }],
    ["planが無い", { clerk_user_id: "clerk-1" }],
    ["planが有効な値でない", { clerk_user_id: "clerk-1", plan: "gold" }],
    [
      "planがセルフサービスで申し込めないenterprise",
      { clerk_user_id: "clerk-1", plan: "enterprise" },
    ],
  ])(
    "%sセッションは、claimも入会の確定もせずにwarningを通知してignoredを返す",
    async (_label, metadata) => {
      const deps = makeDeps();

      const result = await completeOnboardingCheckout(
        { ...INPUT, metadata },
        deps
      );

      expect(result).toEqual({ status: "ignored" });
      expect(deps.errorReporter.captureMessage).toHaveBeenCalledTimes(1);
      expect(deps.errorReporter.captureMessage).toHaveBeenCalledWith(
        "入会のCheckoutセッションのmetadataが無い、または不正なため入会を確定しませんでした",
        {
          level: "warning",
          tags: TAGS,
          extra: {
            stripeCheckoutSessionId: "cs_1",
            eventId: "evt_1",
            metadata,
          },
        }
      );
      expect(deps.webhookEventRepo.claim).not.toHaveBeenCalled();
      expect(deps.onboardingRepo.confirm).not.toHaveBeenCalled();
    }
  );

  it.each(["unpaid", "no_payment_required"])(
    "payment_statusが%sのセッションは、claimも入会の確定もせずにwarningを通知してignoredを返す",
    async (paymentStatus) => {
      const deps = makeDeps();

      const result = await completeOnboardingCheckout(
        { ...INPUT, paymentStatus },
        deps
      );

      expect(result).toEqual({ status: "ignored" });
      expect(deps.errorReporter.captureMessage).toHaveBeenCalledTimes(1);
      expect(deps.errorReporter.captureMessage).toHaveBeenCalledWith(
        "入会のCheckoutセッションが支払い済みでないため入会を確定しませんでした",
        {
          level: "warning",
          tags: TAGS,
          extra: {
            stripeCheckoutSessionId: "cs_1",
            eventId: "evt_1",
            clerkUserId: "clerk-1",
            paymentStatus,
          },
        }
      );
      expect(deps.webhookEventRepo.claim).not.toHaveBeenCalled();
      expect(deps.onboardingRepo.confirm).not.toHaveBeenCalled();
    }
  );

  it("claimして、取得したサブスクリプションのステータス・期間・開始日時で入会を確定し、processedを返す", async () => {
    const deps = makeDeps();
    vi.mocked(deps.subscriptionGateway.retrieveSubscription).mockResolvedValue({
      status: "active",
      currentPeriodStart: new Date(2026, 2, 1),
      currentPeriodEnd: new Date(2026, 3, 1),
      // JST 2026-03-05 10:00
      startedAt: new Date("2026-03-05T01:00:00Z"),
    });

    const result = await completeOnboardingCheckout(INPUT, deps);

    expect(result).toEqual({ status: "processed" });
    expect(deps.webhookEventRepo.claim).toHaveBeenCalledWith(EVENT);
    expect(deps.subscriptionGateway.retrieveSubscription).toHaveBeenCalledWith(
      "sub_1"
    );
    expect(deps.onboardingRepo.confirm).toHaveBeenCalledWith(
      expect.objectContaining({
        rank: "basic",
        stripeCustomerId: "cus_1",
        stripeSubscriptionId: "sub_1",
        status: "active",
        currentPeriodStart: new Date(2026, 2, 1),
        currentPeriodEnd: new Date(2026, 3, 1),
        billingAnchorDay: 5,
      })
    );
    expect(deps.accountGateway.updateOnboardingMetadata).toHaveBeenCalledWith(
      "clerk-1",
      true
    );
    expect(deps.webhookEventRepo.markProcessed).toHaveBeenCalledWith("evt_1");
    expect(deps.errorReporter.captureMessage).not.toHaveBeenCalled();
  });

  it.each([
    [
      "member_not_found",
      "退会済み、または未登録の会員の入会が届きました。手動で返金・解約してください",
    ],
    [
      "conflicting_subscription",
      "入会済みの会員、または別の会員で記録済みのサブスクリプションの入会が届きました。手動で返金・解約してください",
    ],
  ] as const)(
    "入会の確定の結果が%sなら、手動での返金・解約が要るとerrorを通知し、イベントを処理済みにする",
    async (confirmResult, message) => {
      const deps = makeDeps({
        onboardingRepo: makeOnboardingRepo(confirmResult),
      });

      const result = await completeOnboardingCheckout(INPUT, deps);

      expect(result).toEqual({ status: "processed" });
      expect(deps.errorReporter.captureMessage).toHaveBeenCalledTimes(1);
      expect(deps.errorReporter.captureMessage).toHaveBeenCalledWith(message, {
        level: "error",
        tags: TAGS,
        extra: {
          stripeCheckoutSessionId: "cs_1",
          eventId: "evt_1",
          clerkUserId: "clerk-1",
          stripeCustomerId: "cus_1",
          stripeSubscriptionId: "sub_1",
        },
      });
      expect(deps.webhookEventRepo.markProcessed).toHaveBeenCalledWith("evt_1");
    }
  );

  it("確定済み（already_confirmed）の再配信は通知せずにprocessedを返す", async () => {
    const deps = makeDeps({
      onboardingRepo: makeOnboardingRepo("already_confirmed"),
    });

    await expect(completeOnboardingCheckout(INPUT, deps)).resolves.toEqual({
      status: "processed",
    });
    expect(deps.errorReporter.captureMessage).not.toHaveBeenCalled();
  });

  it.each(["processing", "processed"] as const)(
    "claimできなかった（%s）再送は、入会を確定せずにskippedを返す",
    async (claim) => {
      const deps = makeDeps({ webhookEventRepo: makeWebhookEventRepo(claim) });

      await expect(completeOnboardingCheckout(INPUT, deps)).resolves.toEqual({
        status: "skipped",
        claim,
      });
      expect(
        deps.subscriptionGateway.retrieveSubscription
      ).not.toHaveBeenCalled();
      expect(deps.onboardingRepo.confirm).not.toHaveBeenCalled();
    }
  );

  it("サブスクリプションの取得に失敗したら、clerkUserIdを添えて例外を通知し、イベントをfailedにしてfailedを返す", async () => {
    const deps = makeDeps();
    const error = new Error("Stripe API error");
    vi.mocked(deps.subscriptionGateway.retrieveSubscription).mockRejectedValue(
      error
    );

    const result = await completeOnboardingCheckout(INPUT, deps);

    expect(result).toEqual({ status: "failed", error });
    expect(deps.errorReporter.captureException).toHaveBeenCalledWith(error, {
      tags: TAGS,
      extra: {
        stripeCheckoutSessionId: "cs_1",
        eventId: "evt_1",
        clerkUserId: "clerk-1",
      },
    });
    expect(deps.webhookEventRepo.markFailed).toHaveBeenCalledWith(
      "evt_1",
      "Stripe API error"
    );
    expect(deps.onboardingRepo.confirm).not.toHaveBeenCalled();
  });
});
