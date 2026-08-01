import type { CartItem } from "@/domain/value-objects/cart-item";

export type SplitCartResult = {
  atOrderItems: CartItem[];
  afterOrderItems: CartItem[];
};

export function splitCartByPaymentTiming(
  cartItems: CartItem[]
): SplitCartResult {
  const atOrderItems = cartItems.filter(
    (item) => item.paymentTiming === "at_order" && !item.isNegotiable
  );
  const afterOrderItems = cartItems.filter(
    (item) => item.paymentTiming === "after_order" || item.isNegotiable
  );
  return { atOrderItems, afterOrderItems };
}
