import type { MemberRank } from "@/domain/value-objects/member-rank";

// 注文確認画面で選ぶ住所
export type CheckoutAddressDto = {
  id: string;
  isDefault: boolean;
  recipientLastName: string;
  recipientFirstName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
};

// 注文確認画面（/order/checkout）。商品の価格はランクから選ぶ
export type CheckoutDto = {
  rank: MemberRank;
  shippingAddresses: CheckoutAddressDto[];
  billingAddresses: CheckoutAddressDto[];
};

// 注文完了画面に出す明細。価格要相談の明細は unitPriceSnapshot が null
export type CompletedOrderItemDto = {
  id: string;
  productNameSnapshot: string;
  quantity: number;
  unitPriceSnapshot: number | null;
  isNegotiable: boolean;
};

// Checkout 完了画面（/order/complete）
export type CheckoutCompletedOrderDto = {
  orderId: string;
  createdAt: string;
  atOrderItems: CompletedOrderItemDto[];
  afterOrderItems: CompletedOrderItemDto[];
};

// 後払いの注文完了画面（/order/invoice-complete）。後払いの明細だけを持つ
export type InvoiceRequestedOrderDto = {
  orderId: string;
  createdAt: string;
  items: CompletedOrderItemDto[];
};

// 会員の注文系画面の読み取り。他の会員のデータを返さないよう、どのメソッドも会員（clerkUserId）を必須にする
export interface MemberOrderQueryService {
  // 退会済み・存在しない会員は null
  findCheckout(clerkUserId: string): Promise<CheckoutDto | null>;
  // 他の会員の注文・存在しない Checkout Session は null
  findCheckoutCompletedOrder(input: {
    clerkUserId: string;
    stripeCheckoutSessionId: string;
  }): Promise<CheckoutCompletedOrderDto | null>;
  // 他の会員の注文・存在しない注文・後払いの明細が無い注文は null
  findInvoiceRequestedOrder(input: {
    clerkUserId: string;
    orderId: string;
  }): Promise<InvoiceRequestedOrderDto | null>;
}
