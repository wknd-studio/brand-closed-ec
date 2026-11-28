import type { OrderRepository } from "@/repositories/order-repository";
import type { OperatorNotifier } from "@/repositories/operator-notifier";
import type { ErrorReporter } from "@/repositories/error-reporter";
import { retryOnOrderConflict } from "@/use-cases/retry-on-order-conflict";
import { notifyOperator } from "@/use-cases/notify-operator";

export type MarkInvoiceOrderAsPaidInput = { stripeInvoiceId: string };
export type MarkInvoiceOrderAsPaidDeps = {
  orderRepo: OrderRepository;
  operatorNotifier: OperatorNotifier;
  errorReporter: ErrorReporter;
};

/**
 * Stripe Invoiceの入金を、対応する決済単位のpaidとして記録する。
 * 保存が別の書き手（請求作成・運営者のキャンセル・同じイベントの同時配信）と競合したら、入金は実際に
 * されているため、注文を読み直してやり直す（issue #721）
 */
export async function markInvoiceOrderAsPaid(
  input: MarkInvoiceOrderAsPaidInput,
  deps: MarkInvoiceOrderAsPaidDeps
): Promise<void> {
  await retryOnOrderConflict(() => markPaidOnce(input, deps));
}

async function markPaidOnce(
  input: MarkInvoiceOrderAsPaidInput,
  deps: MarkInvoiceOrderAsPaidDeps
): Promise<void> {
  const { orderRepo, errorReporter } = deps;

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
    // リトライを続けてしまうため、要手動対応としてErrorReporterで通知した上で200を返す
    errorReporter.captureException(
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

  const paidSettlement = settlement.markPaid(new Date());
  await orderRepo.save(order.applySettlement(paidSettlement), {
    type: "system",
  });

  await notifyOperator(
    deps,
    {
      type: "invoicePaid",
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: paidSettlement.amount,
    },
    "markInvoiceOrderAsPaid"
  );
}
