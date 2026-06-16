import type { CartItem } from "@/domain/value-objects/cart-item";
import type { PaymentFlow } from "@/domain/entities/order";

export function selectOrderFlow(cartItems: CartItem[]): PaymentFlow {
  return cartItems.some((item) => item.isNegotiable) ? "invoice" : "checkout";
}
