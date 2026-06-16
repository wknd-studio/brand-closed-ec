import { Money } from "@/domain/value-objects/money";
import { OrderStatus } from "@/domain/value-objects/order-status";
import type { OrderRepository } from "@/repositories/order-repository";
import type { UserRepository } from "@/repositories/user-repository";
import type { PaymentGateway } from "@/repositories/payment-gateway";
import type { NotificationService } from "@/repositories/notification-service";

export type IssueInvoiceInput = {
  orderId: string;
  negotiatedPrices: Record<string, number>; // orderItemId → unit price
};

export type IssueInvoiceDeps = {
  orderRepo: OrderRepository;
  userRepo: UserRepository;
  paymentGateway: PaymentGateway;
  notificationService: NotificationService;
};

export type IssueInvoiceOutput = { success: true } | { limitExceeded: true };

export async function issueInvoice(
  input: IssueInvoiceInput,
  deps: IssueInvoiceDeps
): Promise<IssueInvoiceOutput> {
  const { orderRepo, userRepo, paymentGateway, notificationService } = deps;

  const order = await orderRepo.findById(input.orderId);
  if (!order) throw new Error("注文が見つかりません");
  if (order.status.value !== "confirming")
    throw new Error("確認中の注文ではありません");

  const user = await userRepo.findById(order.userId);
  if (!user) throw new Error("ユーザーが見つかりません");

  const period = user.getMonthlyPeriod();
  const confirmedAmount = await orderRepo.sumConfirmedAmountByUserId(
    user.id,
    period
  );

  const negotiableItems = order.items.filter((i) => i.isNegotiable);
  const negotiatedTotal = negotiableItems.reduce((sum, item) => {
    const price = input.negotiatedPrices[item.id] ?? 0;
    return sum + price * item.quantity;
  }, 0);

  const monthlyLimit = order.monthlyLimitAtOrder.amount;
  if (monthlyLimit > 0 && confirmedAmount + negotiatedTotal > monthlyLimit) {
    const limitExceededOrder = order.with({
      status: OrderStatus.of("limit_exceeded"),
    });
    await orderRepo.save(limitExceededOrder);
    await notificationService.sendLimitExceeded(user.email, order.id);
    return { limitExceeded: true };
  }

  const updatedItems = order.items.map((item) => {
    if (!item.isNegotiable) return item;
    const price = input.negotiatedPrices[item.id];
    if (price === undefined) return item;
    return item.with({ negotiatedUnitPrice: Money.of(price) });
  });

  const stripeCustomerId =
    user.stripeCustomerId ??
    (await paymentGateway.ensureCustomer(user.email, user.id));

  if (!user.stripeCustomerId) {
    await userRepo.save(user.with({ stripeCustomerId }));
  }

  const invoiceOrder = order.with({
    items: updatedItems,
    status: OrderStatus.of("invoice_sent"),
  });

  const stripeInvoiceId = await paymentGateway.createInvoiceForOrder(
    invoiceOrder,
    stripeCustomerId
  );

  await orderRepo.save(invoiceOrder.with({ stripeInvoiceId }));

  return { success: true };
}
