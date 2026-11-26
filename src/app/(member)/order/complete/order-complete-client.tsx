"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart/cart-provider";
import type { CompletedOrderItemDto } from "@/queries/member-order-query-service";
import { presentOrderComplete } from "@/app/(member)/order/order-complete-presenter";
import OrderCompleteView from "@/app/(member)/order/order-complete-view";

type Props = {
  orderNumber: string;
  createdAt: string;
  /** 今回のお支払い（Checkout）の対象商品 */
  items: CompletedOrderItemDto[];
  /** 同じ注文内の後払い商品。運営者が確認後に請求書を送付する */
  afterOrderItems: CompletedOrderItemDto[];
};

export default function OrderCompleteClient({
  orderNumber,
  createdAt,
  items,
  afterOrderItems,
}: Props) {
  const { emptyCart } = useCart();

  useEffect(() => {
    emptyCart();
  }, [emptyCart]);

  return (
    <OrderCompleteView
      view={presentOrderComplete({
        orderNumber,
        createdAt,
        atOrderItems: items,
        afterOrderItems,
      })}
    />
  );
}
