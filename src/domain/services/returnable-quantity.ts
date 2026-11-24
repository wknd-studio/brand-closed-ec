import type { OrderItem } from "@/domain/entities/order-item";
import type { OrderSettlement } from "@/domain/entities/order-settlement";
import type { ReturnRequest } from "@/domain/entities/return-request";
import type { OrderStatus } from "@/domain/value-objects/order-status";

/**
 * 明細ごとの、まだ返品・返金を申請できる数量（docs/domain/returns.md）。
 * 申請対象にならない明細は含めない。申請対象でも全数量が申請済みなら0で含める。
 * - キャンセル済みの注文・キャンセル済みの決済単位の明細は対象外
 * - at_order の明細は、支払い完了前ならパターン①（returns を使わず注文のキャンセルで完結する）のため対象外
 * - 数量は、注文数量から有効な申請（ReturnRequest.isActive()）の数量を引いたもの
 */
export function returnableQuantities(input: {
  orderStatus: OrderStatus;
  items: readonly OrderItem[];
  settlements: readonly OrderSettlement[];
  returns: readonly ReturnRequest[];
}): Map<string, number> {
  const result = new Map<string, number>();
  if (input.orderStatus.isTerminal()) return result;

  const settlementById = new Map(input.settlements.map((s) => [s.id, s]));
  const requested = new Map<string, number>();
  for (const r of input.returns.filter((r) => r.isActive())) {
    for (const item of r.items) {
      requested.set(
        item.orderItemId,
        (requested.get(item.orderItemId) ?? 0) + item.quantity
      );
    }
  }

  for (const item of input.items) {
    const settlement = item.settlementId
      ? settlementById.get(item.settlementId)
      : undefined;
    if (settlement?.isCancelled()) continue;
    if (!item.isAfterOrder() && !settlement?.isPaid()) continue;
    result.set(item.id, item.quantity - (requested.get(item.id) ?? 0));
  }
  return result;
}
