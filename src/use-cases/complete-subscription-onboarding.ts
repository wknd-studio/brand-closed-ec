import { MemberRank } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";
import type {
  SubscriptionRepository,
  SubscriptionStatus,
} from "@/repositories/subscription-repository";

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
  subscriptionRepo: SubscriptionRepository;
  accountGateway: AccountGateway;
};

export async function completeSubscriptionOnboarding(
  input: CompleteSubscriptionOnboardingInput,
  deps: CompleteSubscriptionOnboardingDeps
): Promise<void> {
  const { userRepo, subscriptionRepo, accountGateway } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  // Stripe Webhookは同一イベントを複数回配信することがある。再配信時に
  // billing_anchor_day等を再度書き換えないよう、既に完了済みなら何もしない
  if (user.hasCompletedOnboarding()) return;

  const updated = user.with({
    rank: MemberRank.of(input.plan),
    stripeCustomerId: input.stripeCustomerId,
    billingAnchorDay: MonthlyPeriod.toBillingAnchorDay(new Date()),
    onboardingCompleted: true,
  });

  await userRepo.save(updated);
  await subscriptionRepo.upsert({
    userId: updated.id,
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    stripeSubscriptionScheduleId: null,
    status: input.status,
    rank: input.plan,
    pendingRank: null,
    currentPeriodStart: input.currentPeriodStart,
    currentPeriodEnd: input.currentPeriodEnd,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  });
  await accountGateway.updateOnboardingMetadata(input.clerkUserId, true);
}
