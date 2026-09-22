import * as Sentry from "@sentry/nextjs";
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

  if (settlement.isCancelled()) {
    // 運営者が未払い決済単位をキャンセルした後、Stripeが遅延Webhookを再送した
    // ケース（issue #270）。例外を投げてWebhookに500を返すとStripeが最大3日間
    // リトライを続けてしまうため、要手動対応としてSentryに記録した上で200を返す
    Sentry.captureException(
      new Error("キャンセル済みの決済単位への入金Webhookを受信しました"),
      {
        tags: { useCase: "markInvoiceOrderAsPaid" },
        extra: {
          orderId: order.id,
          settlementId: settlement.id,
          stripeInvoiceId: input.stripeInvoiceId,
        },
      }
    );
    return;
  }

  const paidOrder = order.applySettlement(settlement.markPaid(new Date()));
  await orderRepo.save(paidOrder);

  const user = await userRepo.findById(order.userId);
  if (user) {
    await notificationService.sendInvoicePaid(paidOrder, user);
  }
}
