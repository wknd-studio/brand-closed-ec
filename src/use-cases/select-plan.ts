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

  const now = new Date();

  const existing = await userRepo.findByClerkUserId(input.clerkUserId);

  const user = existing
    ? existing.with({
        email: input.email,
        rank: MemberRank.of(input.plan),
        termsAgreedAt: now,
        termsVersion: input.termsVersion,
        onboardingCompleted: false,
      })
    : User.of({
        id: crypto.randomUUID(),
        clerkUserId: input.clerkUserId,
        email: input.email,
        firstName: "",
        lastName: "",
        phoneNumber: "",
        profileCompletedAt: null,
        rank: MemberRank.of(input.plan),
        subscribedAt: null,
        onboardingCompleted: false,
        termsAgreedAt: now,
        termsVersion: input.termsVersion,
        deletedAt: null,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      });

  await userRepo.save(user);
  await accountGateway.updateOnboardingMetadata(input.clerkUserId, false);

  return {
    redirectTo: `/onboarding/payment?plan=${input.plan}`,
  };
}
