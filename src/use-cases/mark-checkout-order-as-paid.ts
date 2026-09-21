import type { OrderRepository } from "@/repositories/order-repository";
import type { UserRepository } from "@/repositories/user-repository";
import type { NotificationService } from "@/repositories/notification-service";

export type MarkCheckoutOrderAsPaidInput = { stripeCheckoutSessionId: string };
export type MarkCheckoutOrderAsPaidDeps = {
  orderRepo: OrderRepository;
  userRepo: UserRepository;
  notificationService: NotificationService;
};

/** Checkout Sessionの決済完了を、対応する決済単位のpaidとして記録する */
export async function markCheckoutOrderAsPaid(
  input: MarkCheckoutOrderAsPaidInput,
  deps: MarkCheckoutOrderAsPaidDeps
): Promise<void> {
  const { orderRepo, userRepo, notificationService } = deps;

  const order = await orderRepo.findByStripeCheckoutSessionId(
    input.stripeCheckoutSessionId
  );
  if (!order) throw new Error("注文が見つかりません");

  const settlement = order.settlements.find(
    (s) => s.stripeCheckoutSessionId === input.stripeCheckoutSessionId
  );
  if (!settlement) throw new Error("決済単位が見つかりません");
  // Webhookの再配信に対する冪等性
  if (settlement.isPaid()) return;

  const paidOrder = order.applySettlement(settlement.markPaid(new Date()));
  await orderRepo.save(paidOrder);

  const user = await userRepo.findById(order.userId);
  if (user) {
    await notificationService.sendCheckoutPaid(paidOrder, user);
  }
}
