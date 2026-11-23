import type { OrderRepository } from "@/repositories/order-repository";

export type CancelExpiredCheckoutSettlementInput = {
  stripeCheckoutSessionId: string;
};
export type CancelExpiredCheckoutSettlementDeps = {
  orderRepo: OrderRepository;
};

/**
 * 決済されないまま期限切れになったCheckout Sessionの決済単位をキャンセルする（#202）。
 * キャンセルした明細は月次上限の確定額から外れる。orders.status はロールアップし直し、
 * 変わったときだけ system として order_status_changes に記録する（save が同じトランザクションで行う）
 */
export async function cancelExpiredCheckoutSettlement(
  input: CancelExpiredCheckoutSettlementInput,
  deps: CancelExpiredCheckoutSettlementDeps
): Promise<void> {
  const { orderRepo } = deps;

  const order = await orderRepo.findByStripeCheckoutSessionId(
    input.stripeCheckoutSessionId
  );
  // 注文の作成に失敗して補償削除された注文のセッション等。キャンセルする決済単位が無いため何もしない
  // （例外にするとWebhookに500を返し、Stripeが再送を続けてしまう）
  if (!order) return;

  const settlement = order.settlements.find(
    (s) => s.stripeCheckoutSessionId === input.stripeCheckoutSessionId
  );
  if (!settlement) throw new Error("決済単位が見つかりません");
  // 支払い済み（期限切れの前に決済が完了した）・キャンセル済み（運営者のキャンセル・Webhookの再配信）は何もしない
  if (settlement.isPaid() || settlement.isCancelled()) return;

  const cancelledOrder = order.applySettlement(settlement.cancel(new Date()));
  await orderRepo.save(cancelledOrder, { type: "system" });
}
