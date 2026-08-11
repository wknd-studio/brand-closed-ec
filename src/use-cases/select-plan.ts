import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { PhoneNumber } from "@/domain/value-objects/phone-number";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";
import type { OrganizationRepository } from "@/repositories/organization-repository";

export type SelectPlanInput = {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  plan: MemberRankValue;
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

    // rankは仮保存し、onboarding_completedはStripe決済完了のWebhook
    // （completeOrganizationSubscriptionOnboarding）で確定させる。
    // 個人会員のselectPlanと同じパターン。
    await organizationRepo.save(
      organization.with({ rank: MemberRank.of(input.plan) })
    );

    return {
      redirectTo: `/onboarding/payment?plan=${input.plan}&organizationId=${input.organizationId}`,
    };
  }

  const phoneNumber = PhoneNumber.of(input.phoneNumber);
  const existing = await userRepo.findByClerkUserId(input.clerkUserId);

  const user = existing
    ? existing.with({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phoneNumber: phoneNumber.value,
        rank: MemberRank.of(input.plan),
        onboardingCompleted: false,
      })
    : User.of({
        id: crypto.randomUUID(),
        clerkUserId: input.clerkUserId,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phoneNumber: phoneNumber.value,
        profileCompletedAt: null,
        rank: MemberRank.of(input.plan),
        subscribedAt: null,
        onboardingCompleted: false,
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
