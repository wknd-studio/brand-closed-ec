"use client";

import { useEffect } from "react";
import { useCart } from "@/components/cart/cart-provider";
import type { CompletedOrderItemDto } from "@/queries/member-order-query-service";
import { presentOrderComplete } from "@/app/(member)/order/order-complete-presenter";
import OrderCompleteView from "@/app/(member)/order/order-complete-view";

type Props = {
  orderNumber: string;
  createdAt: string;
  items: CompletedOrderItemDto[];
};

export default function InvoiceCompleteClient({
  orderNumber,
  createdAt,
  items,
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
        atOrderItems: [],
        afterOrderItems: items,
      })}
    />
  );
}
