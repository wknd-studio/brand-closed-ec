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
    firstName: input.firstName,
    lastName: input.lastName,
    phoneNumber: "",
    profileCompletedAt: null,
    rank: MemberRank.of("starter"),
    billingAnchorDay: null,
    onboardingCompleted: false,
    deletedAt: null,
    stripeCustomerId: null,
  });

  await deps.userRepo.save(user);
}
