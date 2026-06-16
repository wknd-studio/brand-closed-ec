import { OrderStatus } from "@/domain/value-objects/order-status";
import type { OrderRepository } from "@/repositories/order-repository";
import type { UserRepository } from "@/repositories/user-repository";
import type { NotificationService } from "@/repositories/notification-service";

export type MarkCheckoutOrderAsPaidInput = { stripeCheckoutSessionId: string };
export type MarkCheckoutOrderAsPaidDeps = {
  orderRepo: OrderRepository;
  userRepo: UserRepository;
  notificationService: NotificationService;
};

export async function markCheckoutOrderAsPaid(
  input: MarkCheckoutOrderAsPaidInput,
  deps: MarkCheckoutOrderAsPaidDeps
): Promise<void> {
  const { orderRepo, userRepo, notificationService } = deps;

  const order = await orderRepo.findByStripeCheckoutSessionId(
    input.stripeCheckoutSessionId
  );
  if (!order) throw new Error("注文が見つかりません");
  if (order.status.value === "paid") return;

  const paidOrder = order.with({ status: OrderStatus.of("paid") });
  await orderRepo.save(paidOrder);

  const user = await userRepo.findById(order.userId);
  if (user) {
    await notificationService.sendCheckoutPaid(paidOrder, user);
  }
}
