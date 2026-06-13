export class MonthlyPeriod {
  private constructor(
    readonly start: Date,
    readonly end: Date
  ) {}

  static fromSubscribedAt(
    subscribedAt: Date | null,
    now: Date = new Date()
  ): MonthlyPeriod {
    if (!subscribedAt) {
      return new MonthlyPeriod(
        new Date(now.getFullYear(), now.getMonth(), 1),
        new Date(now.getFullYear(), now.getMonth() + 1, 1)
      );
    }

    const day = subscribedAt.getDate();
    const startThisMonth = new Date(now.getFullYear(), now.getMonth(), day);

    if (now >= startThisMonth) {
      return new MonthlyPeriod(
        startThisMonth,
        new Date(now.getFullYear(), now.getMonth() + 1, day)
      );
    }

    return new MonthlyPeriod(
      new Date(now.getFullYear(), now.getMonth() - 1, day),
      startThisMonth
    );
  }

  contains(date: Date): boolean {
    return date >= this.start && date < this.end;
  }
}
