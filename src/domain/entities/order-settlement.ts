import { Money } from "@/domain/value-objects/money";
import { InvalidStatusTransitionError } from "@/domain/errors/invalid-status-transition-error";

export type SettlementFlow = "checkout" | "invoice";

export type SettlementStatus =
  | "pending_payment"
  | "invoice_sent"
  | "limit_exceeded"
  | "paid"
  | "cancelled";

/**
 * 決済単位の状態遷移の表（docs/domain/settlement.md「決済単位ごとの状態遷移」）。
 * 初期状態（checkoutはpending_payment、invoiceはinvoice_sent・limit_exceeded）は
 * 作成時に決まるため、遷移には含めない。paid・cancelledは終端。
 */
const ALLOWED_TRANSITIONS: Record<
  SettlementStatus,
  ReadonlySet<SettlementStatus>
> = {
  pending_payment: new Set(["paid", "cancelled"]),
  invoice_sent: new Set(["paid", "cancelled"]),
  limit_exceeded: new Set(["cancelled"]),
  paid: new Set(),
  cancelled: new Set(),
};

export function isAllowedSettlementTransition(
  from: SettlementStatus,
  to: SettlementStatus
): boolean {
  return ALLOWED_TRANSITIONS[from].has(to);
}

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

  isLimitExceeded(): boolean {
    return this.status === "limit_exceeded";
  }

  /** 請求済みで未払い（invoice_sent）、または上限超過で運営者の対応待ち（limit_exceeded） */
  isUnresolved(): boolean {
    return this.status === "invoice_sent" || this.isLimitExceeded();
  }

  /** paid → paid（Webhookの再配信）も拒否する。冪等性はuse-case側で扱う */
  markPaid(at: Date): OrderSettlement {
    return this.transitionTo("paid", { paidAt: at });
  }

  /** paidのキャンセル（返金）はreturnsのフローで扱うため拒否する */
  cancel(at: Date): OrderSettlement {
    return this.transitionTo("cancelled", { cancelledAt: at });
  }

  private transitionTo(
    to: SettlementStatus,
    overrides: Partial<OrderSettlementProps>
  ): OrderSettlement {
    if (!isAllowedSettlementTransition(this.status, to)) {
      throw new InvalidStatusTransitionError(this.status, to);
    }
    return this.with({ ...overrides, status: to });
  }
}
