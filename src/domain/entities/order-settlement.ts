import { Money } from "@/domain/value-objects/money";

export type SettlementFlow = "checkout" | "invoice";

export type SettlementStatus =
  | "pending_payment"
  | "invoice_sent"
  | "limit_exceeded"
  | "paid"
  | "cancelled";

interface OrderSettlementProps {
  id: string;
  orderId: string;
  flow: SettlementFlow;
  status: SettlementStatus;
  stripeCheckoutSessionId: string | null;
  stripeInvoiceId: string | null;
  amount: Money;
  paidAt: Date | null;
  cancelledAt: Date | null;
}

/**
 * 決済単位（1つのStripe Checkout Session、または1つのStripe Invoice）。
 * 1つの注文に複数存在しうる（docs/domain/settlement.md）
 */
export class OrderSettlement {
  readonly id: string;
  readonly orderId: string;
  readonly flow: SettlementFlow;
  readonly status: SettlementStatus;
  readonly stripeCheckoutSessionId: string | null;
  readonly stripeInvoiceId: string | null;
  readonly amount: Money;
  readonly paidAt: Date | null;
  readonly cancelledAt: Date | null;

  private constructor(props: OrderSettlementProps) {
    this.id = props.id;
    this.orderId = props.orderId;
    this.flow = props.flow;
    this.status = props.status;
    this.stripeCheckoutSessionId = props.stripeCheckoutSessionId;
    this.stripeInvoiceId = props.stripeInvoiceId;
    this.amount = props.amount;
    this.paidAt = props.paidAt;
    this.cancelledAt = props.cancelledAt;
  }

  static of(props: OrderSettlementProps): OrderSettlement {
    return new OrderSettlement(props);
  }

  with(overrides: Partial<OrderSettlementProps>): OrderSettlement {
    return new OrderSettlement({
      id: this.id,
      orderId: this.orderId,
      flow: this.flow,
      status: this.status,
      stripeCheckoutSessionId: this.stripeCheckoutSessionId,
      stripeInvoiceId: this.stripeInvoiceId,
      amount: this.amount,
      paidAt: this.paidAt,
      cancelledAt: this.cancelledAt,
      ...overrides,
    });
  }

  isPaid(): boolean {
    return this.status === "paid";
  }

  isCancelled(): boolean {
    return this.status === "cancelled";
  }

  markPaid(at: Date): OrderSettlement {
    if (this.isCancelled()) {
      throw new Error("キャンセル済みの決済単位は支払い済みにできません");
    }
    return this.with({ status: "paid", paidAt: at });
  }

  cancel(at: Date): OrderSettlement {
    if (this.isPaid()) {
      throw new Error("支払い済みの決済単位はキャンセルできません");
    }
    return this.with({ status: "cancelled", cancelledAt: at });
  }
}
