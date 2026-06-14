import { Money } from "./money";

interface CartItemProps {
  sanityProductId: string;
  productName: string;
  quantity: number;
  unitPrice: Money;
  isNegotiable: boolean;
}

export class CartItem {
  readonly sanityProductId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly isNegotiable: boolean;

  private constructor(props: CartItemProps) {
    this.sanityProductId = props.sanityProductId;
    this.productName = props.productName;
    this.quantity = props.quantity;
    this.unitPrice = props.unitPrice;
    this.isNegotiable = props.isNegotiable;
  }

  static of(props: CartItemProps): CartItem {
    if (props.quantity <= 0) {
      throw new Error(`数量は1以上である必要があります: ${props.quantity}`);
    }
    return new CartItem(props);
  }

  getSubtotal(): Money {
    return Money.of(this.unitPrice.amount * this.quantity);
  }

  updateQuantity(qty: number): CartItem {
    return CartItem.of({ ...this.toProps(), quantity: qty });
  }

  private toProps(): CartItemProps {
    return {
      sanityProductId: this.sanityProductId,
      productName: this.productName,
      quantity: this.quantity,
      unitPrice: this.unitPrice,
      isNegotiable: this.isNegotiable,
    };
  }
}
