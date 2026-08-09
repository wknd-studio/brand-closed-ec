import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { PhoneNumber } from "@/domain/value-objects/phone-number";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";
import type { OrganizationRepository } from "@/repositories/organization-repository";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";

export type SelectPlanInput = {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  plan: MemberRankValue;
  // Clerkのlegal_accepted_at（サインアップ時の利用規約・プライバシーポリシー同意日時）。
  // 通常はuser.createdウェブフック（createUser）が既にusers.terms_agreed_atへ
  // 記録済みのため、ここではウェブフック未到達時の新規作成フォールバックにのみ使う
  legalAcceptedAt: Date | null;
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

  // termsAgreedAt/termsVersionはuser.createdウェブフック（createUser）が
  // Clerkのlegal_accepted_atから記録済みのため、既存ユーザーの場合はここで
  // 上書きしない。ウェブフック未到達の新規作成時のみinput.legalAcceptedAtから設定する
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
        termsAgreedAt: input.legalAcceptedAt,
        termsVersion: input.legalAcceptedAt ? CURRENT_TERMS_VERSION : null,
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
