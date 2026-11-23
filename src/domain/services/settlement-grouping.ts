type SettlementLike = { readonly id: string };
type SettlementItemLike = { readonly settlementId: string | null };

/**
 * 注文の明細を決済単位ごとに分ける（決済単位の並びを保つ）。決済単位に割り当てられていない明細
 * （settlement_id IS NULL。注文後に請求予定の商品）は unassigned に分ける（docs/domain/settlement.md）
 */
export function groupItemsBySettlement<
  S extends SettlementLike,
  I extends SettlementItemLike,
>(
  settlements: readonly S[],
  items: readonly I[]
): { groups: { settlement: S; items: I[] }[]; unassigned: I[] } {
  return {
    groups: settlements.map((settlement) => ({
      settlement,
      items: items.filter((item) => item.settlementId === settlement.id),
    })),
    unassigned: items.filter((item) => item.settlementId === null),
  };
}
