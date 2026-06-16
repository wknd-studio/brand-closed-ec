import { Money } from "@/domain/value-objects/money";

interface OrderItemProps {
  id: string;
  sanityProductId: string;
  productNameSnapshot: string;
  unitPriceSnapshot: Money;
  quantity: number;
  isNegotiable: boolean;
  negotiatedUnitPrice: Money | null;
}

export class OrderItem {
  readonly id: string;
  readonly sanityProductId: string;
  readonly productNameSnapshot: string;
  readonly unitPriceSnapshot: Money;
  readonly quantity: number;
  readonly isNegotiable: boolean;
  readonly negotiatedUnitPrice: Money | null;

  private constructor(props: OrderItemProps) {
    this.id = props.id;
    this.sanityProductId = props.sanityProductId;
    this.productNameSnapshot = props.productNameSnapshot;
    this.unitPriceSnapshot = props.unitPriceSnapshot;
    this.quantity = props.quantity;
    this.isNegotiable = props.isNegotiable;
    this.negotiatedUnitPrice = props.negotiatedUnitPrice;
  }

  static of(props: OrderItemProps): OrderItem {
    return new OrderItem(props);
  }

  with(overrides: Partial<OrderItemProps>): OrderItem {
    return new OrderItem({
      id: this.id,
      sanityProductId: this.sanityProductId,
      productNameSnapshot: this.productNameSnapshot,
      unitPriceSnapshot: this.unitPriceSnapshot,
      quantity: this.quantity,
      isNegotiable: this.isNegotiable,
      negotiatedUnitPrice: this.negotiatedUnitPrice,
      ...overrides,
    });
  }

  getSubtotal(): Money {
    if (this.isNegotiable) {
      if (!this.negotiatedUnitPrice) return Money.zero();
      return Money.of(this.negotiatedUnitPrice.amount * this.quantity);
    }
    return Money.of(this.unitPriceSnapshot.amount * this.quantity);
  }

  isPriceConfirmed(): boolean {
    if (!this.isNegotiable) return true;
    return this.negotiatedUnitPrice !== null;
  }
}
