import { OrderStatus } from "@/domain/value-objects/order-status";
import { Money } from "@/domain/value-objects/money";
import { MemberRank } from "@/domain/value-objects/member-rank";
import { AddressSnapshot } from "@/domain/value-objects/address-snapshot";
import { OrderItem } from "./order-item";

export type PaymentFlow = "checkout" | "invoice";

interface OrderProps {
  id: string;
  userId: string;
  paymentFlow: PaymentFlow;
  status: OrderStatus;
  shippingAddress: AddressSnapshot;
  billingAddress: AddressSnapshot;
  rankAtOrder: MemberRank;
  monthlyLimitAtOrder: Money;
  stripeCheckoutSessionId: string | null;
  stripeInvoiceId: string | null;
  items: OrderItem[];
  createdAt: Date;
}

export class Order {
  readonly id: string;
  readonly userId: string;
  readonly paymentFlow: PaymentFlow;
  readonly status: OrderStatus;
  readonly shippingAddress: AddressSnapshot;
  readonly billingAddress: AddressSnapshot;
  readonly rankAtOrder: MemberRank;
  readonly monthlyLimitAtOrder: Money;
  readonly stripeCheckoutSessionId: string | null;
  readonly stripeInvoiceId: string | null;
  readonly items: OrderItem[];
  readonly createdAt: Date;

  private constructor(props: OrderProps) {
    this.id = props.id;
    this.userId = props.userId;
    this.paymentFlow = props.paymentFlow;
    this.status = props.status;
    this.shippingAddress = props.shippingAddress;
    this.billingAddress = props.billingAddress;
    this.rankAtOrder = props.rankAtOrder;
    this.monthlyLimitAtOrder = props.monthlyLimitAtOrder;
    this.stripeCheckoutSessionId = props.stripeCheckoutSessionId;
    this.stripeInvoiceId = props.stripeInvoiceId;
    this.items = props.items;
    this.createdAt = props.createdAt;
  }

  static of(props: OrderProps): Order {
    return new Order(props);
  }

  with(overrides: Partial<OrderProps>): Order {
    return new Order({ ...this.toProps(), ...overrides });
  }

  private toProps(): OrderProps {
    return {
      id: this.id,
      userId: this.userId,
      paymentFlow: this.paymentFlow,
      status: this.status,
      shippingAddress: this.shippingAddress,
      billingAddress: this.billingAddress,
      rankAtOrder: this.rankAtOrder,
      monthlyLimitAtOrder: this.monthlyLimitAtOrder,
      stripeCheckoutSessionId: this.stripeCheckoutSessionId,
      stripeInvoiceId: this.stripeInvoiceId,
      items: this.items,
      createdAt: this.createdAt,
    };
  }

  isInvoiceFlow(): boolean {
    return this.paymentFlow === "invoice";
  }

  canAdvanceStatus(): boolean {
    return this.status.canAdvance();
  }

  nextStatus(): OrderStatus {
    return this.status.next();
  }

  canCancel(): boolean {
    return this.status.isCancellable();
  }

  getFixedTotal(): Money {
    return this.items
      .filter((item) => !item.isNegotiable)
      .reduce((sum, item) => sum.add(item.getSubtotal()), Money.zero());
  }
}
