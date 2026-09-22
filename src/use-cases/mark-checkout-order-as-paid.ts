import * as Sentry from "@sentry/nextjs";
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

  if (settlement.isCancelled()) {
    // 運営者が未払い決済単位をキャンセルした後、顧客が古いCheckoutページで決済を
    // 完了させた、またはStripeが遅延Webhookを再送したケース（issue #270）。
    // 例外を投げてWebhookに500を返すとStripeが最大3日間リトライを続けてしまうため、
    // 要手動対応としてSentryに記録した上で200を返す（入金自体は実際にされている）
    Sentry.captureException(
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
  await orderRepo.save(paidOrder);

  const user = await userRepo.findById(order.userId);
  if (user) {
    await notificationService.sendCheckoutPaid(paidOrder, paidSettlement, user);
  }
}
