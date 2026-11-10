import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import type { CartItem } from "@/domain/value-objects/cart-item";
import type { Money } from "@/domain/value-objects/money";
import type { User } from "@/domain/entities/user";
import { sumFixedTotal } from "./fixed-total";

export function checkMonthlyLimit(
  user: User,
  cartItems: CartItem[],
  confirmedAmount: Money
): void {
  const fixedTotal = confirmedAmount.add(sumFixedTotal(cartItems));

  const limit = user.getMonthlyLimit();
  if (fixedTotal.isOver(limit)) {
    throw new LimitExceededError(fixedTotal.amount, limit.amount);
  }
}
