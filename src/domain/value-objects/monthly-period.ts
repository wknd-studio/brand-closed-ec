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

  static fromBillingAnchorDay(
    billingAnchorDay: number | null,
    now: Date = new Date()
  ): MonthlyPeriod {
    if (billingAnchorDay === null) {
      return MonthlyPeriod.fromSubscribedAt(null, now);
    }
    return MonthlyPeriod.fromSubscribedAt(
      new Date(now.getFullYear(), now.getMonth(), billingAnchorDay),
      now
    );
  }

  contains(date: Date): boolean {
    return date >= this.start && date < this.end;
  }

  // docs/domain/subscription-billing.md: billing_anchor_dayはCHECK制約で
  // 1〜28に制限されるため、29〜31日は28に丸める
  static toBillingAnchorDay(date: Date): number {
    return Math.min(date.getDate(), 28);
  }
}
