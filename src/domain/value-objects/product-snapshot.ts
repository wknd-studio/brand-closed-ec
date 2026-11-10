import type { Money } from "./money";
import type { MemberRankValue } from "./member-rank";

// 注文確定時点でサーバー側から取得した商品情報。カートの明細は、価格・支払いタイミング等を
// カートの値ではなくこの値から作る（CartItem.fromProducts）
export interface ProductSnapshot {
  sanityProductId: string;
  productName: string;
  unitPrice: Money;
  isNegotiable: boolean;
  minRank: MemberRankValue;
  paymentTiming: "at_order" | "after_order";
}
