export type RelatedOrderSummary = {
  id: string;
  paymentFlow: "checkout" | "invoice";
  status: string;
};

/**
 * split_group_idを共有する注文一覧から、現在の注文以外の1件を取り出す。
 * 分割が発生していない場合（自分しかいない・空配列）はnullを返す
 */
export function pickRelatedOrder(
  currentOrderId: string,
  splitGroupOrders: RelatedOrderSummary[]
): RelatedOrderSummary | null {
  return splitGroupOrders.find((o) => o.id !== currentOrderId) ?? null;
}
