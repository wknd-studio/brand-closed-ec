import { MemberRank } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";

export type UpgradeSubscriptionInput = {
  clerkUserId: string;
  plan: MemberRankValue;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
};

export type UpgradeSubscriptionDeps = {
  userRepo: UserRepository;
  accountGateway: AccountGateway;
};

export async function upgradeSubscription(
  input: UpgradeSubscriptionInput,
  deps: UpgradeSubscriptionDeps
): Promise<void> {
  const { userRepo, accountGateway } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  const upgraded = user.with({
    rank: MemberRank.of(input.plan),
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    subscribedAt: new Date(),
    onboardingCompleted: true,
  });

  await userRepo.save(upgraded);
  await accountGateway.updateOnboardingMetadata(input.clerkUserId, true);
}
