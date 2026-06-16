import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import type { CartItem } from "@/domain/value-objects/cart-item";
import type { Money } from "@/domain/value-objects/money";
import type { User } from "@/domain/entities/user";

export function checkMonthlyLimit(
  user: User,
  cartItems: CartItem[],
  confirmedAmount: Money
): void {
  const fixedTotal = cartItems
    .filter((item) => !item.isNegotiable)
    .reduce((sum, item) => sum.add(item.getSubtotal()), confirmedAmount);

  const limit = user.getMonthlyLimit();
  if (fixedTotal.isOver(limit)) {
    throw new LimitExceededError(fixedTotal.amount, limit.amount);
  }
}
