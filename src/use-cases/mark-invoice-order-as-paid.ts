import type { OrderRepository } from "@/repositories/order-repository";
import type { UserRepository } from "@/repositories/user-repository";
import type { NotificationService } from "@/repositories/notification-service";

export type MarkInvoiceOrderAsPaidInput = { stripeInvoiceId: string };
export type MarkInvoiceOrderAsPaidDeps = {
  orderRepo: OrderRepository;
  userRepo: UserRepository;
  notificationService: NotificationService;
};

/** Stripe Invoiceの入金を、対応する決済単位のpaidとして記録する */
export async function markInvoiceOrderAsPaid(
  input: MarkInvoiceOrderAsPaidInput,
  deps: MarkInvoiceOrderAsPaidDeps
): Promise<void> {
  const { orderRepo, userRepo, notificationService } = deps;

  const order = await orderRepo.findByStripeInvoiceId(input.stripeInvoiceId);
  // サブスクリプション請求など、注文に紐づかないInvoiceは対象外
  if (!order) return;

  const settlement = order.settlements.find(
    (s) => s.stripeInvoiceId === input.stripeInvoiceId
  );
  if (!settlement) return;
  // Webhookの再配信に対する冪等性
  if (settlement.isPaid()) return;

  const paidOrder = order.applySettlement(settlement.markPaid(new Date()));
  await orderRepo.save(paidOrder);

  const user = await userRepo.findById(order.userId);
  if (user) {
    await notificationService.sendInvoicePaid(paidOrder, user);
  }
}
