/**
 * orders.statusは正のデータではなく、配下のorder_settlements・order_itemsから
 * 算出する表示用のロールアップ値（docs/domain/settlement.md）。
 * 調達・出荷の進捗（旧sourcing〜delivered）はprocurement/fulfillment側の責務のため含まない。
 */
export const ORDER_STATUS_VALUES = [
  "cancelled",
  "processing",
  "limit_exceeded",
  "paid",
] as const;

export type OrderStatusValue = (typeof ORDER_STATUS_VALUES)[number];

const CANCELLABLE_STATUSES: Set<OrderStatusValue> = new Set([
  "processing",
  "limit_exceeded",
]);

// 会員向けの画面（注文履歴・注文詳細）に出す表示ラベル。processing は一部の決済単位だけ
// 支払い済みの場合も含むため、「未払い」ではなく手続き中と表す（docs/domain/settlement.md）
const LABELS: Record<OrderStatusValue, string> = {
  cancelled: "キャンセル済み",
  processing: "お支払い手続き中",
  limit_exceeded: "ご利用上限超過のため保留中",
  paid: "お支払い済み",
};

export class OrderStatus {
  private constructor(readonly value: OrderStatusValue) {}

  static of(value: string): OrderStatus {
    if (!(ORDER_STATUS_VALUES as readonly string[]).includes(value)) {
      throw new Error(`不正なOrderStatus値: ${value}`);
    }
    return new OrderStatus(value as OrderStatusValue);
  }

  isTerminal(): boolean {
    return this.value === "cancelled";
  }

  isCancellable(): boolean {
    return CANCELLABLE_STATUSES.has(this.value);
  }

  label(): string {
    return LABELS[this.value];
  }

  equals(other: OrderStatus): boolean {
    return this.value === other.value;
  }
}
