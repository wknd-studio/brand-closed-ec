import { DomainError } from "./domain-error";

/**
 * 返品・返金の申請の内容が受け付けられない理由（docs/domain/returns.md）。
 * item_not_returnable は、申請対象にならない明細（パターン①・キャンセル済み）と、別の注文の明細の両方
 */
export type InvalidReturnRequestReason =
  | "no_items"
  | "invalid_quantity"
  | "duplicate_item"
  | "item_not_returnable"
  | "quantity_exceeded"
  | "reason_required";

export class InvalidReturnRequestError extends DomainError {
  constructor(readonly reason: InvalidReturnRequestReason) {
    super(`返品・返金の申請を受け付けられません: ${reason}`);
  }
}
