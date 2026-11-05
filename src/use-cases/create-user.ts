import { User } from "@/domain/entities/user";
import { MemberRank } from "@/domain/value-objects/member-rank";
import type { UserRepository } from "@/repositories/user-repository";
import type { AccountGateway } from "@/repositories/account-gateway";

export type CreateUserInput = {
  clerkUserId: string;
  email: string;
  firstName: string;
  lastName: string;
};

export type CreateUserDeps = {
  userRepo: UserRepository;
  accountGateway: AccountGateway;
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

  // 再送時やselectPlanが先に行を作っていた場合は、既存行を初期値で上書きしない
  await deps.userRepo.insertIfAbsent(user);

  // Clerk標準の削除は退会処理（withdraw）を通らないため、ユーザーごとに無効にする。
  // 失敗したら投げてWebhookを失敗させ、Clerkの再送でやり直す（行の作成は上で冪等）
  await deps.accountGateway.disableSelfDelete(input.clerkUserId);
}
