import { DomainError } from "./domain-error";

export type ItemsNotInvoiceableReason =
  | "no_items"
  | "order_cancelled"
  | "item_not_in_order"
  | "not_after_order"
  | "already_settled"
  | "price_not_fixed";

const MESSAGES: Record<ItemsNotInvoiceableReason, string> = {
  no_items: "請求する明細が選ばれていません",
  order_cancelled: "キャンセル済みの注文は請求できません",
  item_not_in_order: "この注文に含まれない明細は請求できません",
  not_after_order: "後払いでない明細は請求できません",
  already_settled: "すでに請求済みの明細が含まれています",
  price_not_fixed: "価格が決まっていない明細は請求できません",
};

/** 請求作成で選んだ明細に、請求できないものが含まれている（docs/domain/settlement.md「請求作成」） */
export class ItemsNotInvoiceableError extends DomainError {
  constructor(
    readonly orderId: string,
    readonly reason: ItemsNotInvoiceableReason
  ) {
    super(MESSAGES[reason]);
  }
}
