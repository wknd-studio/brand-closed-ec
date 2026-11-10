import { Money } from "@/domain/value-objects/money";

export type PaymentTiming = "at_order" | "after_order";

interface OrderItemProps {
  id: string;
  sanityProductId: string;
  productNameSnapshot: string;
  unitPriceSnapshot: Money;
  quantity: number;
  isNegotiable: boolean;
  negotiatedUnitPrice: Money | null;
  /** 注文確定時点の支払いタイミングのスナップショット */
  paymentTiming: PaymentTiming;
  /** 属する決済単位。NULL＝まだ決済単位が作られていない（請求作成前のafter_order等） */
  settlementId: string | null;
}

export class OrderItem {
  readonly id: string;
  readonly sanityProductId: string;
  readonly productNameSnapshot: string;
  readonly unitPriceSnapshot: Money;
  readonly quantity: number;
  readonly isNegotiable: boolean;
  readonly negotiatedUnitPrice: Money | null;
  readonly paymentTiming: PaymentTiming;
  readonly settlementId: string | null;

  private constructor(props: OrderItemProps) {
    this.id = props.id;
    this.sanityProductId = props.sanityProductId;
    this.productNameSnapshot = props.productNameSnapshot;
    this.unitPriceSnapshot = props.unitPriceSnapshot;
    this.quantity = props.quantity;
    this.isNegotiable = props.isNegotiable;
    this.negotiatedUnitPrice = props.negotiatedUnitPrice;
    this.paymentTiming = props.paymentTiming;
    this.settlementId = props.settlementId;
  }

  static of(props: OrderItemProps): OrderItem {
    return new OrderItem(props);
  }

  getSubtotal(): Money {
    if (this.isNegotiable) {
      if (!this.negotiatedUnitPrice) return Money.zero();
      return Money.of(this.negotiatedUnitPrice.amount * this.quantity);
    }
    return Money.of(this.unitPriceSnapshot.amount * this.quantity);
  }

  /** 後払い（注文後に運営者が請求書を送る）の明細か。注文確定時のスナップショットで決まる */
  isAfterOrder(): boolean {
    return this.paymentTiming === "after_order";
  }

  isPriceConfirmed(): boolean {
    if (!this.isNegotiable) return true;
    return this.negotiatedUnitPrice !== null;
  }
}
