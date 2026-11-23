import type { CartItem } from "@/domain/value-objects/cart-item";
import type { Money } from "@/domain/value-objects/money";
import type { MonthlyLimit } from "@/domain/value-objects/monthly-limit";
import { sumFixedTotal } from "./fixed-total";

export function checkMonthlyLimit(
  limit: MonthlyLimit,
  cartItems: CartItem[],
  confirmedAmount: Money
): void {
  limit.assertNotExceededBy(confirmedAmount.add(sumFixedTotal(cartItems)));
}
