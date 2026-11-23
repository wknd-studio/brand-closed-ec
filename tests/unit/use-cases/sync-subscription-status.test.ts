import { describe, it, expect, vi } from "vitest";
import { syncSubscriptionStatus } from "@/use-cases/sync-subscription-status";
import type { StripeWebhookEventRepository } from "@/repositories/stripe-webhook-event-repository";
import type { SubscriptionGateway } from "@/repositories/subscription-gateway";
import type { SubscriptionRepository } from "@/repositories/subscription-repository";
import {
  makeErrorReporter,
  makeSubscriptionGateway,
  makeSubscriptionRepo,
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

function makeDeps(
  overrides?: Partial<{
    webhookEventRepo: StripeWebhookEventRepository;
    subscriptionGateway: SubscriptionGateway;
    subscriptionRepo: SubscriptionRepository;
  }>
) {
  return {
    webhookEventRepo: overrides?.webhookEventRepo ?? makeWebhookEventRepo(),
    errorReporter: makeErrorReporter(),
    subscriptionGateway:
      overrides?.subscriptionGateway ?? makeSubscriptionGateway(),
    subscriptionRepo: overrides?.subscriptionRepo ?? makeSubscriptionRepo(),
  };
}

// イベントの中身は古い（active）が、Stripeの最新は past_due という状況を作る
const EVENT = {
  eventId: "evt_1",
  type: "customer.subscription.updated",
  payload: { id: "evt_1", data: { object: { id: "sub_1", status: "active" } } },
};
const INPUT = { event: EVENT, stripeSubscriptionId: "sub_1" };

const LATEST = {
  status: "past_due" as const,
  currentPeriodStart: new Date(2026, 1, 1),
  currentPeriodEnd: new Date(2026, 2, 1),
  startedAt: new Date(2026, 0, 1),
  cancelAtPeriodEnd: true,
  canceledAt: null,
};

// GitHub issue #377
describe("syncSubscriptionStatus", () => {
  it("イベントの中身ではなく、Stripeから取り直した最新のサブスクリプションの状態でsubscriptionsを更新する", async () => {
    const subscriptionGateway = makeSubscriptionGateway();
    vi.mocked(subscriptionGateway.retrieveSubscription).mockResolvedValue(
      LATEST
    );
    const deps = makeDeps({ subscriptionGateway });

    const result = await syncSubscriptionStatus(INPUT, deps);

    expect(result).toEqual({ status: "processed" });
    expect(subscriptionGateway.retrieveSubscription).toHaveBeenCalledWith(
      "sub_1"
    );
    // ランク（価格）は渡さない。プラン変更の確定は #209 で扱う
    expect(
      deps.subscriptionRepo.syncStatusByStripeSubscriptionId
    ).toHaveBeenCalledWith("sub_1", {
      status: "past_due",
      currentPeriodStart: LATEST.currentPeriodStart,
      currentPeriodEnd: LATEST.currentPeriodEnd,
      cancelAtPeriodEnd: true,
      canceledAt: null,
    });
    expect(deps.webhookEventRepo.markProcessed).toHaveBeenCalledWith("evt_1");
  });

  it("解約済みのサブスクリプションは canceled と解約日時で更新する", async () => {
    const canceledAt = new Date(2026, 1, 15);
    const subscriptionGateway = makeSubscriptionGateway();
    vi.mocked(subscriptionGateway.retrieveSubscription).mockResolvedValue({
      ...LATEST,
      status: "canceled",
      cancelAtPeriodEnd: false,
      canceledAt,
    });
    const deps = makeDeps({ subscriptionGateway });

    await syncSubscriptionStatus(
      {
        event: { ...EVENT, type: "customer.subscription.deleted" },
        stripeSubscriptionId: "sub_1",
      },
      deps
    );

    expect(
      deps.subscriptionRepo.syncStatusByStripeSubscriptionId
    ).toHaveBeenCalledWith(
      "sub_1",
      expect.objectContaining({ status: "canceled", canceledAt })
    );
  });

  it.each(["processed", "processing"] as const)(
    "同じイベントの再配信（%s）はStripeにもsubscriptionsにも触らずにスキップする",
    async (claim) => {
      const deps = makeDeps({ webhookEventRepo: makeWebhookEventRepo(claim) });

      const result = await syncSubscriptionStatus(INPUT, deps);

      expect(result).toEqual({ status: "skipped", claim });
      expect(
        deps.subscriptionGateway.retrieveSubscription
      ).not.toHaveBeenCalled();
      expect(
        deps.subscriptionRepo.syncStatusByStripeSubscriptionId
      ).not.toHaveBeenCalled();
    }
  );

  it("対応するsubscriptionsの行が無ければ、エラーにせずイベントを処理済みにする（入会の確定より先に届いた場合。入会の確定がStripeの最新の状態で行を作る）", async () => {
    const subscriptionRepo = makeSubscriptionRepo();
    vi.mocked(
      subscriptionRepo.syncStatusByStripeSubscriptionId
    ).mockResolvedValue("not_found");
    const deps = makeDeps({ subscriptionRepo });

    const result = await syncSubscriptionStatus(INPUT, deps);

    expect(result).toEqual({ status: "processed" });
    expect(deps.webhookEventRepo.markProcessed).toHaveBeenCalledWith("evt_1");
    expect(deps.webhookEventRepo.markFailed).not.toHaveBeenCalled();
    expect(deps.errorReporter.captureException).not.toHaveBeenCalled();
  });

  it("Stripeからの取得に失敗したら、運営者に通知してイベントをfailedにし、再送で回復できるようにする", async () => {
    const error = new Error("Stripe API error");
    const subscriptionGateway = makeSubscriptionGateway();
    vi.mocked(subscriptionGateway.retrieveSubscription).mockRejectedValue(
      error
    );
    const deps = makeDeps({ subscriptionGateway });

    const result = await syncSubscriptionStatus(INPUT, deps);

    expect(result).toEqual({ status: "failed", error });
    expect(
      deps.subscriptionRepo.syncStatusByStripeSubscriptionId
    ).not.toHaveBeenCalled();
    expect(deps.errorReporter.captureException).toHaveBeenCalledWith(error, {
      tags: { webhook: "stripe", eventType: "customer.subscription.updated" },
      extra: { stripeSubscriptionId: "sub_1", eventId: "evt_1" },
    });
    expect(deps.webhookEventRepo.markFailed).toHaveBeenCalledWith(
      "evt_1",
      "Stripe API error"
    );
  });
});
