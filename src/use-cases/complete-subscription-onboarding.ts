import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";
import type { SubscriptionStatus } from "@/repositories/subscription-repository";
import type {
  ConfirmSubscriptionOnboardingResult,
  SubscriptionOnboardingRepository,
} from "@/repositories/subscription-onboarding-repository";

export type CompleteSubscriptionOnboardingInput = {
  clerkUserId: string;
  plan: MemberRankValue;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  // サブスクリプションの開始日時（Stripeのstart_date）。課金基準日の計算に使う
  subscriptionStartedAt: Date;
};

export type CompleteSubscriptionOnboardingDeps = {
  userRepo: UserRepository;
  onboardingRepo: SubscriptionOnboardingRepository;
  accountGateway: AccountGateway;
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

  await accountGateway.updateOnboardingMetadata(input.clerkUserId, true);
  return result;
}
