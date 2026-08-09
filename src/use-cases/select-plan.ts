import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";
import type { OrganizationRepository } from "@/repositories/organization-repository";

export type SelectPlanInput = {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  plan: MemberRankValue;
  termsVersion: string;
  // 法人組織のオンボーディング中に呼ばれる場合のみ指定する（T021で作成済みの組織ID）
  organizationId?: string;
};

export type SelectPlanDeps = {
  userRepo: UserRepository;
  accountGateway: AccountGateway;
  organizationRepo?: OrganizationRepository;
};

export async function selectPlan(
  input: SelectPlanInput,
  deps: SelectPlanDeps
): Promise<{ redirectTo: string }> {
  const { userRepo, accountGateway, organizationRepo } = deps;

  if (input.organizationId) {
    if (!organizationRepo) {
      throw new Error("organizationRepoが指定されていません");
    }
    const organization = await organizationRepo.findById(input.organizationId);
    if (!organization) throw new Error("組織が見つかりません");

    await organizationRepo.save(
      organization.with({
        rank: MemberRank.of(input.plan),
        onboardingCompleted: true,
      })
    );

    // 組織作成者（代表者）自身のオンボーディングもここで完了扱いにする。
    // 個人会員のonboarding_completedと異なりStripe決済を経由しないため。
    const user = await userRepo.findByClerkUserId(input.clerkUserId);
    if (user) {
      await userRepo.save(user.with({ onboardingCompleted: true }));
    }
    await accountGateway.updateOnboardingMetadata(input.clerkUserId, true);

    return { redirectTo: "/" };
  }

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
