import { getStripe } from "@/infrastructure/stripe/client";
import { StripeOnboardingCheckoutGateway } from "@/infrastructure/stripe/stripe-onboarding-checkout-gateway";
import type { MemberQueryService } from "@/queries/member-query-service";
import type { OnboardingPaymentQueryService } from "@/queries/onboarding-payment-query-service";

// IDの形式でない値はStripeに問い合わせずに弾く（APIのパスに任意の文字列を渡さないため）
const CHECKOUT_SESSION_ID_PATTERN = /^cs_(test|live)_[A-Za-z0-9]+$/;

export class StripeOnboardingPaymentQueryService implements OnboardingPaymentQueryService {
  // 会員の Stripe Customer は、ログイン中の会員のトークンで RLS を効かせた Query Service から読む
  constructor(
    private readonly memberQuery: Pick<
      MemberQueryService,
      "findStripeCustomerId"
    >
  ) {}

  async findPaymentCompleted({
    clerkUserId,
    sessionId,
  }: {
    clerkUserId: string;
    sessionId: string | null;
  }): Promise<boolean> {
    if (await this.isCompletedCheckoutSession(clerkUserId, sessionId)) {
      return true;
    }
    return this.hasActiveSubscription(clerkUserId);
  }

  /**
   * URLのsession_idが、この会員の決済完了済みのCheckout Sessionかを確かめる
   * （GitHub issue #425）。決済していない会員が履歴・ブックマーク等から決済完了画面を
   * 開いたときに、「決済は完了しています」という事実と違う案内を出さないため。
   * 会員の照合は、決済画面がmetadataに入れているclerk_user_idで行う
   */
  private async isCompletedCheckoutSession(
    clerkUserId: string,
    sessionId: string | null
  ): Promise<boolean> {
    if (!sessionId || !CHECKOUT_SESSION_ID_PATTERN.test(sessionId)) {
      return false;
    }

    let session;
    try {
      session = await getStripe().checkout.sessions.retrieve(sessionId);
    } catch (err) {
      // 存在しないIDは利用者の操作（URLの書き換え等）による正常系の一部として扱う
      if (
        (err as { type?: string }).type === "StripeInvalidRequestError" &&
        (err as { statusCode?: number }).statusCode === 404
      ) {
        return false;
      }
      throw err;
    }

    return (
      session.metadata?.clerk_user_id === clerkUserId &&
      session.status === "complete"
    );
  }

  /**
   * 本人のStripe Customerに有効なサブスクリプションがあるかを確かめる（GitHub issue #461）。
   * 決済画面は、有効なサブスクリプションがあるとsession_idを付けずに決済完了画面へ送るため
   * （start-onboarding-checkout.ts）、session_idが無くても決済済みの会員を種別選択へ
   * 戻さないようにする。判定は決済画面と同じhasActiveSubscriptionで行う
   */
  private async hasActiveSubscription(clerkUserId: string): Promise<boolean> {
    const stripeCustomerId =
      await this.memberQuery.findStripeCustomerId(clerkUserId);
    if (!stripeCustomerId) return false;

    return new StripeOnboardingCheckoutGateway().hasActiveSubscription(
      stripeCustomerId
    );
  }
}
