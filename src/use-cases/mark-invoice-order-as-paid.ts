import { OrderStatus } from "@/domain/value-objects/order-status";
import type { OrderRepository } from "@/repositories/order-repository";
import type { UserRepository } from "@/repositories/user-repository";
import type { NotificationService } from "@/repositories/notification-service";

export type MarkInvoiceOrderAsPaidInput = { stripeInvoiceId: string };
export type MarkInvoiceOrderAsPaidDeps = {
  orderRepo: OrderRepository;
  userRepo: UserRepository;
  notificationService: NotificationService;
};

export async function markInvoiceOrderAsPaid(
  input: MarkInvoiceOrderAsPaidInput,
  deps: MarkInvoiceOrderAsPaidDeps
): Promise<void> {
  const { orderRepo, userRepo, notificationService } = deps;

  const order = await orderRepo.findByStripeInvoiceId(input.stripeInvoiceId);
  if (!order) return;
  if (order.status.value === "paid") return;

  const paidOrder = order.with({ status: OrderStatus.of("paid") });
  await orderRepo.save(paidOrder);

  const user = await userRepo.findById(order.userId);
  if (user) {
    await notificationService.sendInvoicePaid(paidOrder, user);
  }
}
