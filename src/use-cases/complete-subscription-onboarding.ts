import type { User } from "@/domain/entities/user";
import {
  MemberRank,
  type MemberRankValue,
} from "@/domain/value-objects/member-rank";
import { MinimumMembershipPeriod } from "@/domain/value-objects/minimum-membership-period";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";
import type { ErrorReporter } from "@/repositories/error-reporter";
import type { MemberRankRepository } from "@/repositories/member-rank-repository";
import type { NotificationService } from "@/repositories/notification-service";
import type { OnboardingCheckoutGateway } from "@/repositories/onboarding-checkout-gateway";
import type { SubscriptionStatusValue } from "@/domain/value-objects/subscription-status";
import type {
  ConfirmSubscriptionOnboardingResult,
  SubscriptionOnboardingRepository,
} from "@/repositories/subscription-onboarding-repository";

export type CompleteSubscriptionOnboardingInput = {
  clerkUserId: string;
  plan: MemberRankValue;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatusValue;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  // サブスクリプションの開始日時（Stripeのstart_date）。課金基準日の計算に使う
  subscriptionStartedAt: Date;
  // 入会のCheckout。入会の完了のメールに出す支払った金額を取る
  stripeCheckoutSessionId: string;
};

export type CompleteSubscriptionOnboardingDeps = {
  userRepo: UserRepository;
  onboardingRepo: SubscriptionOnboardingRepository;
  accountGateway: AccountGateway;
  checkoutGateway: OnboardingCheckoutGateway;
  memberRankRepo: MemberRankRepository;
  notificationService: NotificationService;
  errorReporter: ErrorReporter;
};

export async function completeSubscriptionOnboarding(
  input: CompleteSubscriptionOnboardingInput,
  deps: CompleteSubscriptionOnboardingDeps
): Promise<ConfirmSubscriptionOnboardingResult> {
  const { userRepo, onboardingRepo, accountGateway } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  // 退会済み・users行が無い会員。再送しても成功しないため例外にせず、呼び出し側で
  // 運営者に知らせる（決済済みのため手動で返金・解約する）
  if (!user) return "member_not_found";

  // Stripe Webhookは同一イベントを複数回配信することがある。再配信時の冪等性
  // （同じSubscriptionで確定済みなら何もしない）はconfirmが1トランザクションの中で
  // 判定する。onboarding_completedで早期returnすると、前回Clerkの更新だけが
  // 失敗した場合に再送で回復できないため、ここでは判定しない
  const result = await onboardingRepo.confirm({
    userId: user.id,
    rank: input.plan,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    status: input.status,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    // Webhookの処理時刻を使うと、再送（最大約3日）された日が起算日になってしまう
    billingAnchorDay: MonthlyPeriod.toBillingAnchorDay(
      input.subscriptionStartedAt
    ),
  });
  // 確定していない（入会済みの会員への別のサブスクリプション・別の会員で記録済みの
  // サブスクリプション・確定の中で会員が見つからない）ため、Clerkも触らない
  if (result === "conflicting_subscription" || result === "member_not_found")
    return result;

  // 入会の状態が今回変わったとき（confirmed）だけ送る。Webhookの再配信は already_confirmed に
  // なるため2通目は送らない。Clerkの更新だけ失敗して再送されたときも already_confirmed になり
  // 送る機会が無くなるため、Clerkの更新より先に送る
  if (result === "confirmed") await sendWelcome(user, input, deps);

  await accountGateway.updateOnboardingMetadata(input.clerkUserId, true);
  return result;
}

// 入会は確定済みのため、送れなくても入会は取り消さず、運営者に知らせる
async function sendWelcome(
  user: User,
  input: CompleteSubscriptionOnboardingInput,
  deps: CompleteSubscriptionOnboardingDeps
): Promise<void> {
  const {
    checkoutGateway,
    memberRankRepo,
    notificationService,
    errorReporter,
  } = deps;
  try {
    const rank = MemberRank.of(input.plan);
    const [charge, monthlyLimit] = await Promise.all([
      checkoutGateway.retrieveCheckoutCharge(input.stripeCheckoutSessionId),
      memberRankRepo.findMonthlyLimit(rank),
    ]);
    await notificationService.sendWelcome(user, {
      rank,
      monthlyLimit,
      initialFee: charge.initialFee,
      monthlyFee: charge.monthlyFee,
      nextPaymentAt: input.currentPeriodEnd,
      // 退会の可否（User.withdraw）と同じく、users.created_at から数える
      minimumPeriod: MinimumMembershipPeriod.startingAt(user.createdAt),
    });
  } catch (err) {
    errorReporter.captureException(err, {
      tags: { useCase: "complete-subscription-onboarding", email: "welcome" },
      extra: {
        clerkUserId: input.clerkUserId,
        stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        stripeSubscriptionId: input.stripeSubscriptionId,
      },
    });
  }
}
