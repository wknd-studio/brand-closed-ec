import { DomainError } from "./domain-error";

export type InvalidOrderReason =
  | "no_items"
  | "item_settlement_not_in_order"
  | "settlement_of_other_order";

const MESSAGES: Record<InvalidOrderReason, string> = {
  no_items: "注文に明細がありません",
  item_settlement_not_in_order:
    "明細が、注文に含まれない決済単位に紐付いています",
  settlement_of_other_order: "別の注文の決済単位が含まれています",
};

/** 注文の不変条件（明細が1件以上・明細と決済単位の紐付けが注文の中で閉じている）が破れている */
export class InvalidOrderError extends DomainError {
  constructor(
    readonly orderId: string,
    readonly reason: InvalidOrderReason
  ) {
    super(MESSAGES[reason]);
  }
}
