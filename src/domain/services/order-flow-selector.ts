import type { CartItem } from "@/domain/value-objects/cart-item";

export type SplitCartResult = {
  atOrderItems: CartItem[];
  afterOrderItems: CartItem[];
};

/** 商品をいつ支払うか。要相談の商品は価格が後で決まるため、商品の設定によらず注文後払いになる */
export function settlementTimingOf(item: {
  paymentTiming: "at_order" | "after_order";
  isNegotiable: boolean;
}): "at_order" | "after_order" {
  return item.isNegotiable ? "after_order" : item.paymentTiming;
}

export function splitCartByPaymentTiming(
  cartItems: CartItem[]
): SplitCartResult {
  const atOrderItems = cartItems.filter(
    (item) => settlementTimingOf(item) === "at_order"
  );
  const afterOrderItems = cartItems.filter(
    (item) => settlementTimingOf(item) === "after_order"
  );
  return { atOrderItems, afterOrderItems };
}
