import type { OrderRepository } from "@/repositories/order-repository";
import type { UserRepository } from "@/repositories/user-repository";
import type { NotificationService } from "@/repositories/notification-service";
import type { OperatorNotifier } from "@/repositories/operator-notifier";
import type { ErrorReporter } from "@/repositories/error-reporter";
import { retryOnOrderConflict } from "@/use-cases/retry-on-order-conflict";
import { notifyOperator } from "@/use-cases/notify-operator";

export type MarkCheckoutOrderAsPaidInput = { stripeCheckoutSessionId: string };
export type MarkCheckoutOrderAsPaidDeps = {
  orderRepo: OrderRepository;
  userRepo: UserRepository;
  notificationService: NotificationService;
  operatorNotifier: OperatorNotifier;
  errorReporter: ErrorReporter;
};

/**
 * Checkout Sessionの決済完了を、対応する決済単位のpaidとして記録する。
 * 保存が別の書き手（請求作成・運営者のキャンセル・同じイベントの同時配信）と競合したら、入金は実際に
 * されているため、注文を読み直してやり直す（issue #721）
 */
export async function markCheckoutOrderAsPaid(
  input: MarkCheckoutOrderAsPaidInput,
  deps: MarkCheckoutOrderAsPaidDeps
): Promise<void> {
  await retryOnOrderConflict(() => markPaidOnce(input, deps));
}

async function markPaidOnce(
  input: MarkCheckoutOrderAsPaidInput,
  deps: MarkCheckoutOrderAsPaidDeps
): Promise<void> {
  const { orderRepo, userRepo, notificationService, errorReporter } = deps;

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

  if (settlement.isCancelled()) {
    // 運営者が未払い決済単位をキャンセルした後、顧客が古いCheckoutページで決済を
    // 完了させた、またはStripeが遅延Webhookを再送したケース（issue #270）。
    // 例外を投げてWebhookに500を返すとStripeが最大3日間リトライを続けてしまうため、
    // 要手動対応としてErrorReporterで通知した上で200を返す（入金自体は実際にされている）
    errorReporter.captureException(
      new Error("キャンセル済みの決済単位への入金Webhookを受信しました"),
      {
        tags: { useCase: "markCheckoutOrderAsPaid" },
        extra: {
          orderId: order.id,
          settlementId: settlement.id,
          stripeCheckoutSessionId: input.stripeCheckoutSessionId,
        },
      }
    );
    return;
  }

  const paidSettlement = settlement.markPaid(new Date());
  const paidOrder = order.applySettlement(paidSettlement);
  await orderRepo.save(paidOrder, { type: "system" });

  const user = await userRepo.findById(order.userId);
  if (user) {
    await notificationService.sendCheckoutPaid(paidOrder, paidSettlement, user);
  }
  // 運営者への通知は会員の情報を使わないため、会員が見つからなくても送る
  await notifyOperator(
    deps,
    {
      type: "checkoutPaid",
      orderId: order.id,
      orderNumber: order.orderNumber,
      amount: paidSettlement.amount,
    },
    "markCheckoutOrderAsPaid"
  );
}
