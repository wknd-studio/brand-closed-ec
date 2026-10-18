import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";
import type { MemberRankValue } from "@/domain/value-objects/member-rank";
import { MemberType } from "@/domain/value-objects/member-type";
import { PhoneNumber } from "@/domain/value-objects/phone-number";
import { InvoiceRegistrationNumber } from "@/domain/value-objects/invoice-registration-number";
import { OnboardingAlreadyCompletedError } from "@/domain/errors/onboarding-already-completed-error";
import { MemberWithdrawnError } from "@/domain/errors/member-withdrawn-error";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";

export type SelectPlanInput = {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  plan: MemberRankValue;
  // GitHub issue #200: 法人会員は組織を作らず、個人と同じ1アカウントに
  // member_type='corporate'として会社名・インボイス番号を保持する
  companyName?: string;
  invoiceRegistrationNumber?: string;
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

  // middlewareでも/onboarding/*から外しているが、Server Actionは直接呼べるためここでも拒否する。
  // 入会済みの会員が送信するとrank_code・member_typeが上書きされ、onboarding_completedが
  // falseに戻ってショップから締め出されるうえ、決済でサブスクリプションが二重にできる
  const existing = await userRepo.findByClerkUserId(input.clerkUserId);
  if (existing?.isWithdrawn()) throw new MemberWithdrawnError();
  if (existing?.hasCompletedOnboarding()) {
    throw new OnboardingAlreadyCompletedError();
  }

  const phoneNumber = PhoneNumber.of(input.phoneNumber);
  const isCorporate = input.companyName !== undefined;
  const memberType = MemberType.of(isCorporate ? "corporate" : "individual");
  const invoiceRegistrationNumber = input.invoiceRegistrationNumber
    ? InvoiceRegistrationNumber.of(input.invoiceRegistrationNumber).value
    : null;

  const user = existing
    ? existing.with({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phoneNumber: phoneNumber.value,
        rank: MemberRank.of(input.plan),
        onboardingCompleted: false,
        memberType,
        companyName: input.companyName ?? null,
        invoiceRegistrationNumber,
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
        billingAnchorDay: null,
        onboardingCompleted: false,
        deletedAt: null,
        stripeCustomerId: null,
        memberType,
        companyName: input.companyName ?? null,
        invoiceRegistrationNumber,
      });

  await userRepo.save(user);
  await accountGateway.updateOnboardingMetadata(input.clerkUserId, false);

  return {
    redirectTo: `/onboarding/payment?plan=${input.plan}`,
  };
}
