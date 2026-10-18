import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";
import type { SubscriptionStatus } from "@/repositories/subscription-repository";
import type { SubscriptionOnboardingRepository } from "@/repositories/subscription-onboarding-repository";

export type CompleteSubscriptionOnboardingInput = {
  clerkUserId: string;
  plan: MemberRankValue;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

export type CompleteSubscriptionOnboardingDeps = {
  userRepo: UserRepository;
  onboardingRepo: SubscriptionOnboardingRepository;
  accountGateway: AccountGateway;
};

export async function completeSubscriptionOnboarding(
  input: CompleteSubscriptionOnboardingInput,
  deps: CompleteSubscriptionOnboardingDeps
): Promise<void> {
  const { userRepo, onboardingRepo, accountGateway } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  // Stripe Webhookは同一イベントを複数回配信することがある。再配信時の冪等性
  // （同じSubscriptionで確定済みなら何もしない）はconfirmが1トランザクションの中で
  // 判定する。onboarding_completedで早期returnすると、前回Clerkの更新だけが
  // 失敗した場合に再送で回復できないため、ここでは判定しない
  await onboardingRepo.confirm({
    userId: user.id,
    rank: input.plan,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    status: input.status,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    billingAnchorDay: MonthlyPeriod.toBillingAnchorDay(new Date()),
  });
  await accountGateway.updateOnboardingMetadata(input.clerkUserId, true);
}
