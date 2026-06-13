export class Money {
  readonly amount: number;

  private constructor(amount: number) {
    if (amount < 0)
      throw new Error(`金額は0以上である必要があります: ${amount}`);
    this.amount = amount;
  }

  static of(amount: number): Money {
    return new Money(amount);
  }

  static zero(): Money {
    return new Money(0);
  }

  add(other: Money): Money {
    return new Money(this.amount + other.amount);
  }

  subtract(other: Money): Money {
    return new Money(Math.max(0, this.amount - other.amount));
  }

  isOver(limit: Money): boolean {
    return this.amount > limit.amount;
  }

  isZero(): boolean {
    return this.amount === 0;
  }
}
