import { InvalidStatusTransitionError } from "@/domain/errors/invalid-status-transition-error";

export const ORDER_STATUS_VALUES = [
  "pending_payment",
  "confirming",
  "limit_exceeded",
  "invoice_sent",
  "paid",
  "sourcing",
  "ordered",
  "preparing",
  "shipping",
  "delivered",
  "cancelled",
] as const;

export type OrderStatusValue = (typeof ORDER_STATUS_VALUES)[number];

const ADMIN_TRANSITIONS: Partial<Record<OrderStatusValue, OrderStatusValue>> = {
  paid: "sourcing",
  sourcing: "ordered",
  ordered: "preparing",
  preparing: "shipping",
  shipping: "delivered",
};

const TERMINAL_STATUSES: Set<OrderStatusValue> = new Set([
  "delivered",
  "cancelled",
]);

const CANCELLABLE_STATUSES: Set<OrderStatusValue> = new Set([
  "pending_payment",
  "confirming",
  "limit_exceeded",
  "invoice_sent",
]);

export class OrderStatus {
  private constructor(readonly value: OrderStatusValue) {}

  static of(value: string): OrderStatus {
    if (!(ORDER_STATUS_VALUES as readonly string[]).includes(value)) {
      throw new Error(`不正なOrderStatus値: ${value}`);
    }
    return new OrderStatus(value as OrderStatusValue);
  }

  canAdvance(): boolean {
    return this.value in ADMIN_TRANSITIONS;
  }

  next(): OrderStatus {
    const nextValue = ADMIN_TRANSITIONS[this.value];
    if (!nextValue) {
      throw new InvalidStatusTransitionError(this.value, "?");
    }
    return new OrderStatus(nextValue);
  }

  isTerminal(): boolean {
    return TERMINAL_STATUSES.has(this.value);
  }

  isCancellable(): boolean {
    return CANCELLABLE_STATUSES.has(this.value);
  }

  equals(other: OrderStatus): boolean {
    return this.value === other.value;
  }
}
