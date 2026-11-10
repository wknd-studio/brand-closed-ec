import { Money } from "./money";
import { MemberRank } from "./member-rank";
import type { ProductSnapshot } from "./product-snapshot";
import { ProductNotAccessibleError } from "@/domain/errors/product-not-accessible-error";

interface CartItemProps {
  sanityProductId: string;
  productName: string;
  quantity: number;
  unitPrice: Money;
  isNegotiable: boolean;
  paymentTiming: "at_order" | "after_order";
}

export class CartItem {
  readonly sanityProductId: string;
  readonly productName: string;
  readonly quantity: number;
  readonly unitPrice: Money;
  readonly isNegotiable: boolean;
  readonly paymentTiming: "at_order" | "after_order";

  private constructor(props: CartItemProps) {
    this.sanityProductId = props.sanityProductId;
    this.productName = props.productName;
    this.quantity = props.quantity;
    this.unitPrice = props.unitPrice;
    this.isNegotiable = props.isNegotiable;
    this.paymentTiming = props.paymentTiming;
  }

  static of(props: CartItemProps): CartItem {
    if (props.quantity <= 0) {
      throw new Error(`数量は1以上である必要があります: ${props.quantity}`);
    }
    return new CartItem(props);
  }

  /**
   * サーバー側の商品情報とカートの数量から明細を作る。
   * カート情報は会員のブラウザ側で保持・改竄されうるため、カートからは商品IDと数量だけを使い、
   * 商品名・単価・支払いタイミングはサーバー側の商品情報の値だけを根拠にする（研究文書 決定9）。
   * 商品情報に無い商品・会員のランクでアクセスできない商品はエラーにする
   */
  static fromProducts(
    cartLines: readonly { sanityProductId: string; quantity: number }[],
    products: readonly ProductSnapshot[],
    memberRank: MemberRank
  ): CartItem[] {
    return cartLines.map((line) => {
      const product = products.find(
        (p) => p.sanityProductId === line.sanityProductId
      );
      if (!product) throw new Error("商品が見つかりません");
      if (!memberRank.canAccess(MemberRank.of(product.minRank))) {
        throw new ProductNotAccessibleError(
          product.sanityProductId,
          memberRank.value,
          product.minRank
        );
      }
      return CartItem.of({
        sanityProductId: product.sanityProductId,
        productName: product.productName,
        quantity: line.quantity,
        unitPrice: product.isNegotiable ? Money.zero() : product.unitPrice,
        isNegotiable: product.isNegotiable,
        paymentTiming: product.paymentTiming,
      });
    });
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
      paymentTiming: this.paymentTiming,
    };
  }
}
