import { MemberRank } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";

export type CompleteSubscriptionOnboardingInput = {
  clerkUserId: string;
  plan: MemberRankValue;
  stripeCustomerId: string;
  stripeSubscriptionId: string;
};

export type CompleteSubscriptionOnboardingDeps = {
  userRepo: UserRepository;
  accountGateway: AccountGateway;
};

export async function completeSubscriptionOnboarding(
  input: CompleteSubscriptionOnboardingInput,
  deps: CompleteSubscriptionOnboardingDeps
): Promise<void> {
  const { userRepo, accountGateway } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  const updated = user.with({
    rank: MemberRank.of(input.plan),
    stripeCustomerId: input.stripeCustomerId,
    stripeSubscriptionId: input.stripeSubscriptionId,
    subscribedAt: new Date(),
    onboardingCompleted: true,
  });

  await userRepo.save(updated);
  await accountGateway.updateOnboardingMetadata(input.clerkUserId, true);
}
