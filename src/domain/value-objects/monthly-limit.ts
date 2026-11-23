import { LimitExceededError } from "@/domain/errors/limit-exceeded-error";
import { Money } from "./money";

/**
 * 月間仕入れ上限。金額の正は member_ranks.monthly_limit_amount で、NULL は無制限（enterprise）。
 * 上限0は無制限ではなく上限0として扱う
 */
export class MonthlyLimit {
  // null なら無制限
  private constructor(private readonly limit: Money | null) {}

  static of(amount: number): MonthlyLimit {
    return new MonthlyLimit(Money.of(amount));
  }

  static unlimited(): MonthlyLimit {
    return new MonthlyLimit(null);
  }

  /** DBの値（NULL = 無制限）から作る */
  static fromNullable(amount: number | null): MonthlyLimit {
    return amount === null ? MonthlyLimit.unlimited() : MonthlyLimit.of(amount);
  }

  /** 上限の金額。無制限なら null（DBの monthly_limit_amount・画面のDTOと同じ表し方） */
  get amount(): number | null {
    return this.limit?.amount ?? null;
  }

  isUnlimited(): boolean {
    return this.limit === null;
  }

  isExceededBy(total: Money): boolean {
    return this.limit !== null && total.isOver(this.limit);
  }

  /** 上限を超えていれば LimitExceededError を投げる */
  assertNotExceededBy(total: Money): void {
    if (this.limit !== null && total.isOver(this.limit)) {
      throw new LimitExceededError(total.amount, this.limit.amount);
    }
  }

  /** 上限から使った金額を引いた残り。超過していれば負。無制限なら null */
  remainingAfter(used: Money): number | null {
    return this.limit === null ? null : this.limit.amount - used.amount;
  }
}
