import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { CURRENT_TERMS_VERSION } from "@/lib/terms";
import type { UserRepository } from "@/repositories/user-repository";

export type CreateUserInput = {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  // Clerkのlegal_accepted_at（サインアップ時の利用規約・プライバシーポリシー同意日時）
  legalAcceptedAt: Date | null;
};

export type CreateUserDeps = {
  userRepo: UserRepository;
};

export async function createUser(
  input: CreateUserInput,
  deps: CreateUserDeps
): Promise<void> {
  const user = User.of({
    id: crypto.randomUUID(),
    clerkUserId: input.clerkUserId,
    email: input.email,
    firstName: input.firstName,
    lastName: input.lastName,
    phoneNumber: "",
    profileCompletedAt: null,
    rank: MemberRank.of("starter"),
    subscribedAt: null,
    onboardingCompleted: false,
    termsAgreedAt: input.legalAcceptedAt,
    termsVersion: input.legalAcceptedAt ? CURRENT_TERMS_VERSION : null,
    deletedAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });

  await deps.userRepo.save(user);
}
