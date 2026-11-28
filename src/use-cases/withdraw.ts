import type { UserRepository } from "@/repositories/user-repository";
import type { OrderRepository } from "@/repositories/order-repository";
import type { SubscriptionRepository } from "@/repositories/subscription-repository";
import type { SubscriptionGateway } from "@/repositories/subscription-gateway";
import type { AccountGateway } from "@/repositories/account-gateway";
import type { ErrorReporter } from "@/repositories/error-reporter";
import type { NotificationService } from "@/repositories/notification-service";

export type WithdrawInput = {
  clerkUserId: string;
};

export type WithdrawDeps = {
  userRepo: UserRepository;
  orderRepo: OrderRepository;
  subscriptionRepo: SubscriptionRepository;
  subscriptionGateway: SubscriptionGateway;
  accountGateway: AccountGateway;
  errorReporter: ErrorReporter;
  notificationService: NotificationService;
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
    errorReporter,
    notificationService,
  } = deps;

  const user = await userRepo.findByClerkUserId(input.clerkUserId);
  if (!user) throw new Error("ユーザーが見つかりません");

  const orders = await orderRepo.findByUserId(user.id);
  const withdrawnUser = user.withdraw(orders);
  await userRepo.save(withdrawnUser);

  const subscription = await subscriptionRepo.findActiveByUserId(user.id);
  if (subscription) {
    try {
      await subscriptionGateway.cancelSubscription(
        subscription.stripeSubscriptionId
      );
    } catch (err) {
      await userRepo.save(withdrawnUser.cancelWithdrawal());
      throw err;
    }
  }

  try {
    await accountGateway.banUser(input.clerkUserId);
  } catch (err) {
    errorReporter.captureException(err, {
      tags: { useCase: "withdraw" },
      extra: { clerkUserId: input.clerkUserId },
    });
    console.error(
      "[退会] Clerk アカウントの ban 失敗（deleted_at でアクセス遮断済み）:",
      err
    );
  }

  // 退会は確定済みのため、送れなくても退会は取り消さず、運営者に知らせる。送り先は ban の前に
  // 取った会員（users.email）のため、ban に失敗しても・したあとでも送れる
  try {
    await notificationService.sendWithdrawn(withdrawnUser, {
      withdrawnAt: withdrawnUser.deletedAt!,
      subscriptionCancelled: subscription !== null,
    });
  } catch (err) {
    errorReporter.captureException(err, {
      tags: { useCase: "withdraw", email: "withdrawn" },
      extra: { clerkUserId: input.clerkUserId },
    });
  }
}
