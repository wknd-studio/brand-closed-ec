import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";

export type SelectPlanInput = {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  plan: MemberRankValue;
  termsVersion: string;
};

export type SelectPlanDeps = {
  userRepo: UserRepository;
  accountGateway: AccountGateway;
};

export async function selectPlan(
  input: SelectPlanInput,
  deps: SelectPlanDeps
): Promise<{ redirectTo: string }> {
  const { userRepo, accountGateway } = deps;

  const isFree = input.plan === "free";
  const now = new Date();

  const existing = await userRepo.findByClerkUserId(input.clerkUserId);

  const user = existing
    ? existing.with({
        email: input.email,
        rank: MemberRank.of(input.plan),
        termsAgreedAt: now,
        termsVersion: input.termsVersion,
        onboardingCompleted: isFree,
      })
    : User.of({
        id: crypto.randomUUID(),
        clerkUserId: input.clerkUserId,
        email: input.email,
        rank: MemberRank.of(input.plan),
        subscribedAt: null,
        onboardingCompleted: isFree,
        termsAgreedAt: now,
        termsVersion: input.termsVersion,
        deletedAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      });

  await userRepo.save(user);
  await accountGateway.updateOnboardingMetadata(input.clerkUserId, isFree);

  return {
    redirectTo: isFree ? "/shop" : `/onboarding/payment?plan=${input.plan}`,
  };
}
