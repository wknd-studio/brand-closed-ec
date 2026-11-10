import { MemberRank } from "@/domain/value-objects/member-rank";
import type { StripeWebhookEventClaimInput } from "@/repositories/stripe-webhook-event-repository";
import type { SubscriptionGateway } from "@/repositories/subscription-gateway";
import {
  completeSubscriptionOnboarding,
  type CompleteSubscriptionOnboardingDeps,
} from "@/use-cases/complete-subscription-onboarding";
import {
  processStripeWebhookEventOnce,
  type ProcessStripeWebhookEventOnceDeps,
  type ProcessStripeWebhookEventOnceResult,
} from "@/use-cases/process-stripe-webhook-event-once";

export type CompleteOnboardingCheckoutInput = {
  event: StripeWebhookEventClaimInput;
  stripeCheckoutSessionId: string;
  metadata: Record<string, string> | null;
  paymentStatus: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
};

export type CompleteOnboardingCheckoutDeps =
  CompleteSubscriptionOnboardingDeps &
    ProcessStripeWebhookEventOnceDeps & {
      subscriptionGateway: SubscriptionGateway;
    };

/** `ignored`: 入会を確定しない入力だったため、運営者に知らせて処理しなかった */
export type CompleteOnboardingCheckoutResult =
  | ProcessStripeWebhookEventOnceResult
  | { status: "ignored" };

/**
 * 入会のCheckout（checkout.session.completed の mode: subscription）を受けて入会を確定する。
 * 入会を確定しない入力・確定できなかった結果は、例外にせず運営者に知らせる。
 * 2xx以外を返すとStripeが再送を続け、失敗が続くとエンドポイントが無効化されるため
 */
export async function completeOnboardingCheckout(
  input: CompleteOnboardingCheckoutInput,
  deps: CompleteOnboardingCheckoutDeps
): Promise<CompleteOnboardingCheckoutResult> {
  const { errorReporter, subscriptionGateway } = deps;
  const { event, stripeCheckoutSessionId } = input;
  const tags = { webhook: "stripe", eventType: event.type };

  const clerkUserId = input.metadata?.clerk_user_id;
  const plan = input.metadata?.plan;

  // ENTERPRISE（Dashboardで作る契約）などアプリ外で作られたセッションには入会のmetadataが無い
  if (!clerkUserId || !plan || !MemberRank.isSelfServiceRank(plan)) {
    errorReporter.captureMessage(
      "入会のCheckoutセッションのmetadataが無い、または不正なため入会を確定しませんでした",
      {
        level: "warning",
        tags,
        extra: {
          stripeCheckoutSessionId,
          eventId: event.eventId,
          metadata: input.metadata,
        },
      }
    );
    return { status: "ignored" };
  }

  // 入会は決済完了で確定する（docs/signup-flow.md 設計決定事項#5）。入会のCheckoutは
  // カード決済に限定しているため、paid以外は想定外として運営者に知らせる
  if (input.paymentStatus !== "paid") {
    errorReporter.captureMessage(
      "入会のCheckoutセッションが支払い済みでないため入会を確定しませんでした",
      {
        level: "warning",
        tags,
        extra: {
          stripeCheckoutSessionId,
          eventId: event.eventId,
          clerkUserId,
          paymentStatus: input.paymentStatus,
        },
      }
    );
    return { status: "ignored" };
  }

  const { stripeCustomerId, stripeSubscriptionId } = input;

  // 同じイベントの再送はここでスキップし、同じサブスクリプションの別イベントは
  // 入会確定のRPC（confirm_subscription_onboarding）の冪等性で防ぐ
  return processStripeWebhookEventOnce(
    {
      event,
      process: async () => {
        const subscription =
          await subscriptionGateway.retrieveSubscription(stripeSubscriptionId);

        const result = await completeSubscriptionOnboarding(
          {
            clerkUserId,
            plan,
            stripeCustomerId,
            stripeSubscriptionId,
            status: subscription.status,
            currentPeriodStart: subscription.currentPeriodStart,
            currentPeriodEnd: subscription.currentPeriodEnd,
            subscriptionStartedAt: subscription.startedAt,
          },
          deps
        );

        // 課金済みなのに記録されないサブスクリプション。再送しても成功しないため
        // イベントを処理済みにし、運営者が手動で返金・解約する
        if (
          result === "conflicting_subscription" ||
          result === "member_not_found"
        ) {
          errorReporter.captureMessage(
            result === "member_not_found"
              ? "退会済み、または未登録の会員の入会が届きました。手動で返金・解約してください"
              : "入会済みの会員、または別の会員で記録済みのサブスクリプションの入会が届きました。手動で返金・解約してください",
            {
              level: "error",
              tags,
              extra: {
                stripeCheckoutSessionId,
                eventId: event.eventId,
                clerkUserId,
                stripeCustomerId,
                stripeSubscriptionId,
              },
            }
          );
        }
      },
      failureReport: {
        tags,
        extra: { stripeCheckoutSessionId, eventId: event.eventId, clerkUserId },
      },
    },
    deps
  );
}
