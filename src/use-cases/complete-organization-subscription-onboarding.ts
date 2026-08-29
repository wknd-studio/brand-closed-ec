import { MemberRank } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { MonthlyPeriod } from "@/domain/value-objects/monthly-period";
import type { OrganizationRepository } from "@/repositories/organization-repository";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";
import type {
  SubscriptionRepository,
  SubscriptionStatus,
} from "@/repositories/subscription-repository";

export type CompleteOrganizationSubscriptionOnboardingInput = {
  organizationId: string;
  clerkUserId: string;
  plan: MemberRankValue;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
};

export type CompleteOrganizationSubscriptionOnboardingDeps = {
  organizationRepo: OrganizationRepository;
  userRepo: UserRepository;
  subscriptionRepo: SubscriptionRepository;
  accountGateway: AccountGateway;
};

export async function completeOrganizationSubscriptionOnboarding(
  input: CompleteOrganizationSubscriptionOnboardingInput,
  deps: CompleteOrganizationSubscriptionOnboardingDeps
): Promise<void> {
  const { organizationRepo, userRepo, subscriptionRepo, accountGateway } = deps;

  const organization = await organizationRepo.findById(input.organizationId);
  if (!organization) throw new Error("組織が見つかりません");

  // Stripe Webhookは同一イベントを複数回配信することがある。再配信時に
  // billing_anchor_day等を再度書き換えないよう、既に完了済みなら何もしない
  if (organization.onboardingCompleted) return;

  const updatedOrganization = organization.with({
    rank: MemberRank.of(input.plan),
    stripeCustomerId: input.stripeCustomerId,
    billingAnchorDay: MonthlyPeriod.toBillingAnchorDay(new Date()),
    onboardingCompleted: true,
  });
  await organizationRepo.save(updatedOrganization);
  await subscriptionRepo.upsert({
    organizationId: updatedOrganization.id,
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

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (user) {
    await userRepo.save(user.with({ onboardingCompleted: true }));
  }
  await accountGateway.updateOnboardingMetadata(input.clerkUserId, true);
}
