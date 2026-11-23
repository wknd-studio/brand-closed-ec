import type { StripeWebhookEventClaimInput } from "@/repositories/stripe-webhook-event-repository";
import type { SubscriptionGateway } from "@/repositories/subscription-gateway";
import type { SubscriptionRepository } from "@/repositories/subscription-repository";
import {
  processStripeWebhookEventOnce,
  type ProcessStripeWebhookEventOnceDeps,
  type ProcessStripeWebhookEventOnceResult,
} from "@/use-cases/process-stripe-webhook-event-once";

export type SyncSubscriptionStatusInput = {
  event: StripeWebhookEventClaimInput;
  stripeSubscriptionId: string;
};

export type SyncSubscriptionStatusDeps = ProcessStripeWebhookEventOnceDeps & {
  subscriptionGateway: SubscriptionGateway;
  subscriptionRepo: SubscriptionRepository;
};

/**
 * Stripe のサブスクリプションの状態の変化（customer.subscription.updated / deleted）を
 * subscriptions に同期する（issue #377）。Webhook は再配信・順序の入れ替わりがあるため、
 * イベントの中身ではなく Stripe から取り直した最新の Subscription で更新する。
 * ランク（価格）は書き換えない（プラン変更の確定は #209）
 */
export async function syncSubscriptionStatus(
  input: SyncSubscriptionStatusInput,
  deps: SyncSubscriptionStatusDeps
): Promise<ProcessStripeWebhookEventOnceResult> {
  const { subscriptionGateway, subscriptionRepo } = deps;
  const { event, stripeSubscriptionId } = input;

  return processStripeWebhookEventOnce(
    {
      event,
      process: async () => {
        const subscription =
          await subscriptionGateway.retrieveSubscription(stripeSubscriptionId);
        // 行が無い（入会の checkout.session.completed より先に届いた等）場合は何もせず
        // 処理済みにする。入会の確定が Stripe の最新の状態で行を作るため、取りこぼさない。
        // 例外にすると Stripe が最大3日間再送を続けてしまう
        await subscriptionRepo.syncStatusByStripeSubscriptionId(
          stripeSubscriptionId,
          {
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
            canceledAt: subscription.canceledAt,
          }
        );
      },
      failureReport: {
        tags: { webhook: "stripe", eventType: event.type },
        extra: { stripeSubscriptionId, eventId: event.eventId },
      },
    },
    deps
  );
}
