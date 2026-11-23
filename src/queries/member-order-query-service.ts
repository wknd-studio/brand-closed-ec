import type { MemberRank } from "@/domain/value-objects/member-rank";
import type { OrderStatus } from "@/domain/value-objects/order-status";

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

// 注文履歴の1行。fixedTotal は要相談でない明細の小計の合計で、要相談の明細を含む注文は
// includesNegotiable が true（金額が未確定の分を含むと表示する。#275 と同じ0円扱いを避ける）
export type OrderHistoryItemDto = {
  orderId: string;
  createdAt: string;
  status: OrderStatus;
  fixedTotal: number;
  includesNegotiable: boolean;
  // 商品点数（明細の数量の合計）
  itemCount: number;
};

// 注文履歴画面（/orders）。新しい順に page ページ目（1始まり）の pageSize 件
export type OrderHistoryDto = {
  orders: OrderHistoryItemDto[];
  totalCount: number;
  page: number;
  pageSize: number;
};

// 注文詳細に出す住所（注文時点のスナップショット）
export type OrderDetailAddressDto = {
  fullName: string;
  postalCode: string;
  prefecture: string;
  city: string;
  addressLine1: string;
  addressLine2: string;
  phoneNumber: string;
};

// 注文詳細の決済単位。amount は決済単位の作成時点の金額のスナップショット
export type OrderDetailSettlementDto = {
  id: string;
  flowLabel: string;
  statusLabel: string;
  amount: number;
  items: CompletedOrderItemDto[];
};

// 注文詳細画面（/orders/[id]）。決済単位は作成順。unassignedItems はまだ決済単位に
// 割り当てられていない明細（注文後に請求予定の商品）
export type OrderDetailDto = {
  orderId: string;
  createdAt: string;
  status: OrderStatus;
  rankAtOrder: MemberRank;
  shippingAddress: OrderDetailAddressDto;
  billingAddress: OrderDetailAddressDto;
  settlements: OrderDetailSettlementDto[];
  unassignedItems: CompletedOrderItemDto[];
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
  // キャンセル済み・支払い済みを含む本人の注文。退会済み・存在しない会員・最後より後のページは注文が空
  findOrderHistory(input: {
    clerkUserId: string;
    page: number;
    pageSize: number;
  }): Promise<OrderHistoryDto>;
  // 他の会員の注文・退会済みの会員の注文・存在しない注文は null
  findOrderDetail(input: {
    clerkUserId: string;
    orderId: string;
  }): Promise<OrderDetailDto | null>;
}
