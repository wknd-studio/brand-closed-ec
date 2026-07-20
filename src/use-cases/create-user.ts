import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";
import type { UserRepository } from "@/repositories/user-repository";

export type CreateUserInput = {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
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
    rank: MemberRank.of("starter"),
    subscribedAt: null,
    onboardingCompleted: false,
    termsAgreedAt: null,
    termsVersion: null,
    deletedAt: null,
    stripeCustomerId: null,
    stripeSubscriptionId: null,
  });

  await deps.userRepo.save(user);
}
