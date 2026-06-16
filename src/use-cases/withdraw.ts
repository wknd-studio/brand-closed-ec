import type { UserRepository } from "@/repositories/user-repository";
import type { SubscriptionGateway } from "@/repositories/subscription-gateway";
import type { AccountGateway } from "@/repositories/account-gateway";

export type WithdrawInput = {
  clerkUserId: string;
};

export type WithdrawDeps = {
  userRepo: UserRepository;
  subscriptionGateway: SubscriptionGateway;
  accountGateway: AccountGateway;
};

export async function withdraw(
  input: WithdrawInput,
  deps: WithdrawDeps
): Promise<void> {
  const { userRepo, subscriptionGateway, accountGateway } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  const withdrawnUser = user.with({ deletedAt: new Date() });
  await userRepo.save(withdrawnUser);

  if (user.stripeSubscriptionId && user.rank.value !== "free") {
    try {
      await subscriptionGateway.cancelSubscription(user.stripeSubscriptionId);
    } catch (err) {
      await userRepo.save(user.with({ deletedAt: null }));
      throw err;
    }
  }

  try {
    await accountGateway.deleteUser(input.clerkUserId);
  } catch {
    // deleted_atでアクセスは遮断済み
  }
}
