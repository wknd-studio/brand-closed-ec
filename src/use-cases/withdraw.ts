import * as Sentry from "@sentry/nextjs";
import type { UserRepository } from "@/repositories/user-repository";
import type { OrderRepository } from "@/repositories/order-repository";
import type { SubscriptionRepository } from "@/repositories/subscription-repository";
import type { SubscriptionGateway } from "@/repositories/subscription-gateway";
import type { AccountGateway } from "@/repositories/account-gateway";
import { ActiveOrdersExistError } from "@/domain/errors/active-orders-exist-error";

export type WithdrawInput = {
  clerkUserId: string;
};

export type WithdrawDeps = {
  userRepo: UserRepository;
  orderRepo: OrderRepository;
  subscriptionRepo: SubscriptionRepository;
  subscriptionGateway: SubscriptionGateway;
  accountGateway: AccountGateway;
};

export async function withdraw(
  input: WithdrawInput,
  deps: WithdrawDeps
): Promise<void> {
  const {
    userRepo,
    orderRepo,
    subscriptionRepo,
    subscriptionGateway,
    accountGateway,
  } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  const activeOrders = await orderRepo.findActiveByUserId(user.id);
  if (activeOrders.length > 0) throw new ActiveOrdersExistError();

  const withdrawnUser = user.with({ deletedAt: new Date() });
  await userRepo.save(withdrawnUser);

  const subscription = await subscriptionRepo.findActiveByUserId(user.id);
  if (subscription) {
    try {
      await subscriptionGateway.cancelSubscription(
        subscription.stripeSubscriptionId
      );
    } catch (err) {
      await userRepo.save(user.with({ deletedAt: null }));
      throw err;
    }
  }

  try {
    await accountGateway.deleteUser(input.clerkUserId);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { useCase: "withdraw" },
      extra: { clerkUserId: input.clerkUserId },
    });
    console.error(
      "[退会] Clerk アカウント削除失敗（deleted_at でアクセス遮断済み）:",
      err
    );
  }
}
