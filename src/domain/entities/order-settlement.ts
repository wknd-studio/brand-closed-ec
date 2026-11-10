import { Money } from "@/domain/value-objects/money";
import { InvalidStatusTransitionError } from "@/domain/errors/invalid-status-transition-error";
import { CheckoutSessionNotAttachableError } from "@/domain/errors/checkout-session-not-attachable-error";

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

// 復元の入口（reconstituteOrderSettlement）から private コンストラクタを使うため、static ブロックで受け取る
let construct: (props: OrderSettlementProps) => OrderSettlement;

/**
 * 決済単位（1つのStripe Checkout Session、または1つのStripe Invoice）。
 * 1つの注文に複数存在しうる（docs/domain/settlement.md）
 */
export class OrderSettlement {
  static {
    construct = (props) => new OrderSettlement(props);
  }

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

  private with(overrides: Partial<OrderSettlementProps>): OrderSettlement {
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

  /**
   * 注文確定時に作ったCheckout Sessionを紐付ける。決済前（pending_payment）のCheckoutの
   * 決済単位で、まだ紐付いていないものだけ（Webhookは紐付いたIDで決済単位を探すため付け替えない）
   */
  attachCheckoutSession(sessionId: string): OrderSettlement {
    if (
      this.flow !== "checkout" ||
      this.status !== "pending_payment" ||
      this.stripeCheckoutSessionId !== null ||
      sessionId === ""
    ) {
      throw new CheckoutSessionNotAttachableError(this.id);
    }
    return this.with({ stripeCheckoutSessionId: sessionId });
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

/**
 * DBの行からの復元・注文の組み立て（domain）・テストにだけ使う（src/infrastructure・src/domain の外からの import は lint で禁止。#635）。
 * 正しい状態なら何でも作れるため、既存の決済単位を広げて作り直すと状態遷移の検査（markPaid()・cancel()）を迂回できる
 */
export function reconstituteOrderSettlement(
  props: OrderSettlementProps
): OrderSettlement {
  return construct(props);
}
